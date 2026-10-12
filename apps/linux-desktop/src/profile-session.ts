/** Borrow the live profile cookie per call; keep only a non-reversible in-memory identity for account fencing. */
import { createHash } from 'node:crypto'
import type { Cookie, Session } from 'electron'

/** Expiry-only cookie refreshes must not interrupt an active alarm or rebuild its socket. */
export function cookieIdentity(cookie: string | null): string | null {
  return cookie ? createHash('sha256').update(cookie).digest('hex') : null
}

export class ProfileSession {
  private identity: string | null = null
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private change: ((paused: boolean) => void) | null = null

  constructor(private cookies: Session['cookies'], private origin: () => string, private log: (message: string, error?: unknown) => void) {}

  /** The credential never crosses IPC and is never mirrored into settings or a second store. */
  async cookieHeader(): Promise<string | null> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const cookies = await Promise.race([
        this.cookies.get({ url: this.origin(), name: 'persistent_auth' }),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Profile cookie read timed out')), 8000) })
      ])
      const cookie = cookies.find((candidate) => candidate.httpOnly && (!candidate.expirationDate || candidate.expirationDate > Date.now() / 1000))
      return cookie ? `persistent_auth=${cookie.value}` : null
    } finally { if (timer) clearTimeout(timer) }
  }

  /** Begin observation before loading the hosted page. A restored cookie is already the initial identity. */
  async watch(change: (paused: boolean) => void): Promise<void> {
    try { this.identity = cookieIdentity(await this.cookieHeader()) }
    catch (error) { this.log('Initial profile cookie read failed', error) }
    this.change = change
    this.cookies.on('changed', this.onChanged)
  }

  private onChanged = (_event: Electron.Event, cookie: Cookie, cause: string, removed: boolean): void => {
    const host = new URL(this.origin()).hostname
    const domain = cookie.domain?.replace(/^\./, '')
    if (cookie.name !== 'persistent_auth' || !cookie.httpOnly || !domain || !(host === domain || host.endsWith(`.${domain}`))) return
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (removed && cause === 'overwrite') {
      // Chromium removes the old row before reporting its replacement. Wait for
      // that event rather than briefly treating every sliding expiry as logout.
      this.timer = setTimeout(() => { void this.recheck() }, 200)
      return
    }
    const next = removed ? null : cookieIdentity(`persistent_auth=${cookie.value}`)
    if (next !== this.identity) {
      this.identity = next
      this.change?.(removed)
    }
  }

  private async recheck(): Promise<void> {
    this.timer = null
    const generation = this.generation
    try {
      const next = cookieIdentity(await this.cookieHeader())
      if (generation !== this.generation) return
      if (next !== this.identity) {
        this.identity = next
        this.change?.(next === null)
      }
    } catch (error) { this.log('Profile session transition check failed', error) }
  }

  forget(): void {
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.identity = null
  }

  dispose(): void {
    this.cookies.removeListener('changed', this.onChanged)
    this.forget()
    this.change = null
  }
}
