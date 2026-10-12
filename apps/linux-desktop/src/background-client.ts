/** Profile-authenticated recovery and WebSocket invalidation, independent of the hosted renderer. */
import WebSocket from 'ws'
import { activeProjection } from './projection.js'
import type { NotificationEngine } from './notification-engine.js'

export interface ProfileTransport {
  origin(): string
  cookie(): Promise<string | null>
  request(path: string, init: RequestInit): Promise<Response>
  log(message: string, error?: unknown): void
}

interface RealtimeSocket {
  on(event: 'open' | 'close', handler: () => void): unknown
  on(event: 'message', handler: (data: { toString(): string }) => void): unknown
  on(event: 'error', handler: (error: Error) => void): unknown
  terminate(): void
}
type SocketFactory = (url: URL, options: { headers: { Cookie: string }; handshakeTimeout: number; maxPayload: number }) => RealtimeSocket

export class BackgroundClient {
  private enabled = false
  private paused = false
  private generation = 0
  private socket: RealtimeSocket | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private recovery: ReturnType<typeof setInterval> | null = null
  private monitor: ReturnType<typeof setInterval> | null = null
  private controller: AbortController | null = null
  private syncing = false
  private pending = false
  private backoff = 3000

  constructor(private transport: ProfileTransport, private engine: NotificationEngine, private makeSocket: SocketFactory = (url, options) => new WebSocket(url, options)) {}

  /** Enable background recovery only after native notification registration succeeds. */
  start(): void {
    if (this.enabled) return
    this.enabled = true
    this.recovery = setInterval(() => this.refresh(), 60_000)
    this.monitor = setInterval(() => { void this.engine.tick() }, 5000)
    this.refresh()
    void this.connect()
  }

  /** Fence departed account work synchronously, including unknown-outcome requests and socket callbacks. */
  sessionChanged(paused = false): void {
    this.generation++
    this.paused = paused
    this.controller?.abort()
    this.controller = null
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.socket?.terminate()
    this.socket = null
    void this.engine.reset()
    if (this.enabled && !paused) {
      this.refresh()
      void this.connect()
    }
  }

  /** Resume after the hosted app finishes account cleanup and confirms the new session online. */
  sessionConfirmed(): void {
    if (this.paused) this.sessionChanged(false)
  }

  /** Resume catches up without dropping known obligations while the network is still unavailable. */
  resume(): void {
    this.generation++
    this.controller?.abort()
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.socket?.terminate()
    this.socket = null
    this.backoff = 3000
    this.refresh()
    void this.connect()
  }

  stop(): void {
    this.enabled = false
    this.sessionChanged(this.paused)
    if (this.recovery) clearInterval(this.recovery)
    if (this.monitor) clearInterval(this.monitor)
    this.recovery = null
    this.monitor = null
  }

  /** Coalesce invalidations, abort obsolete snapshots, and discard every late response after an account transition. */
  refresh(): void {
    if (!this.enabled || this.paused) return
    this.pending = true
    this.controller?.abort()
    if (!this.syncing) void this.sync()
  }

  private async sync(): Promise<void> {
    this.syncing = true
    try {
      while (this.pending && this.enabled && !this.paused) {
        this.pending = false
        const generation = this.generation
        const controller = new AbortController()
        this.controller = controller
        try {
          if (!await this.transport.cookie()) {
            if (generation === this.generation) await this.engine.reset()
            continue
          }
          const response = await this.transport.request('/api/sync/occurrences?alarmsOnly=true', {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)])
          })
          if (generation !== this.generation || controller.signal.aborted) continue
          if (response.status === 401) {
            this.sessionChanged(true)
            continue
          }
          if (!response.ok) throw new Error(`Alarm recovery HTTP ${response.status}`)
          const projection = activeProjection(await response.json())
          if (generation === this.generation && !controller.signal.aborted) {
            await this.engine.reconcile(projection)
            this.transport.log(`Alarm recovery succeeded (${projection.size} active occurrences)`)
          }
        } catch (error) {
          if (!controller.signal.aborted && generation === this.generation) this.transport.log('Alarm recovery failed; retaining live notifications', error)
        } finally {
          if (this.controller === controller) this.controller = null
        }
      }
    } finally {
      this.syncing = false
    }
  }

  /** Writes are never retried automatically: an interrupted request may already have committed on the server. */
  async write(id: string, action: 'ack' | 'silence'): Promise<boolean> {
    if (!this.enabled || this.paused) return false
    const generation = this.generation
    try {
      if (!await this.transport.cookie() || generation !== this.generation) return false
      const response = await this.transport.request(`/api/occurrences/${encodeURIComponent(id)}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(20_000)
      })
      if (generation !== this.generation) return false
      if (response.status === 401) this.sessionChanged(true)
      if (!response.ok) this.transport.log(`Notification action rejected: HTTP ${response.status}`)
      this.refresh()
      return response.ok
    } catch (error) {
      this.transport.log('Notification action outcome is unknown; recovering from server', error)
      this.refresh()
      return false
    }
  }

  private async connect(): Promise<void> {
    if (!this.enabled || this.paused || this.socket) return
    const generation = this.generation
    try {
      const cookie = await this.transport.cookie()
      if (generation !== this.generation || !this.enabled || this.paused || this.socket) return
      if (!cookie) {
        this.scheduleReconnect(generation)
        return
      }
      const url = new URL('/ws', this.transport.origin())
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = this.makeSocket(url, { headers: { Cookie: cookie }, handshakeTimeout: 15_000, maxPayload: 256 * 1024 })
      this.socket = socket
      socket.on('open', () => {
        if (generation !== this.generation) return
        this.backoff = 3000
        this.transport.log('Realtime connected')
        this.refresh()
      })
      socket.on('message', (data) => {
        if (generation !== this.generation) return
        try {
          const event = JSON.parse(data.toString()) as { type?: string; occurrenceId?: string }
          if (event.type === 'ping') return
          // Abort any older snapshot before an immediate cross-device clear.
          this.refresh()
          if (event.type === 'dismiss' && typeof event.occurrenceId === 'string') void this.engine.remove(event.occurrenceId)
        } catch (error) {
          this.transport.log('Ignoring malformed realtime message', error)
        }
      })
      socket.on('error', (error) => this.transport.log('Realtime connection failed; will recover', error))
      socket.on('close', () => {
        if (generation !== this.generation) return
        this.socket = null
        this.scheduleReconnect(generation)
      })
    } catch (error) {
      this.transport.log('Realtime connection could not start', error)
      this.scheduleReconnect(generation)
    }
  }

  private scheduleReconnect(generation: number): void {
    if (!this.enabled || this.paused || generation !== this.generation || this.retry) return
    this.retry = setTimeout(() => {
      this.retry = null
      void this.connect()
    }, this.backoff)
    this.backoff = Math.min(60_000, this.backoff * 2)
  }
}
