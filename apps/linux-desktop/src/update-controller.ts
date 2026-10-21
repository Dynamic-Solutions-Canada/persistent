import { nativeText } from './localization.js'
/** Automatic checks and manual actions share one prompt-gated, cancellation-safe updater. */
import type { LinuxUpdate } from './release-check.js'

export interface UpdateState {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'
  message: string
  automatic: boolean
  downloaded: boolean
  version?: string
  progress?: number
}
interface UpdateOptions {
  automatic: boolean
  find(): Promise<LinuxUpdate | null>
  confirm(action: 'download' | 'install', version: string): Promise<boolean>
  download(update: LinuxUpdate, signal: AbortSignal, progress: (percent: number) => void): Promise<string>
  install(file: string, update: LinuxUpdate): Promise<void>
  changed(state: UpdateState): void
  log(message: string, error?: unknown): void
}

export class UpdateController {
  private state: UpdateState
  private update: LinuxUpdate | null = null
  private file: string | null = null
  private operation: Promise<void> | null = null
  private stopped = false
  private offered: string | null = null
  private abort = new AbortController()
  private startup: ReturnType<typeof setTimeout> | null = null
  private periodic: ReturnType<typeof setInterval> | null = null

  constructor(private options: UpdateOptions) {
    this.state = { phase: 'idle', message: nativeText("Downloads and installation require your approval."), automatic: options.automatic, downloaded: false }
  }

  snapshot(): UpdateState { return { ...this.state } }

  /** Background checks run after startup and every six hours, without downloading on a timer. */
  start(): void {
    this.startup = setTimeout(() => { void this.check(false) }, 20_000)
    this.periodic = setInterval(() => { void this.check(false) }, 6 * 60 * 60_000)
  }

  setAutomatic(value: boolean): void {
    this.state.automatic = value
    this.options.changed(this.snapshot())
  }

  /** Coalesce all operations; late results after shutdown cannot prompt, publish or install. */
  private run(action: () => Promise<void>): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (this.operation) return this.operation
    this.operation = (async () => {
      try { await action() }
      catch (error) {
        if (this.stopped) return
        this.options.log('Linux update operation failed', error)
        this.publish('error', error instanceof Error ? error.message : nativeText("The update could not be completed."))
      }
    })().finally(() => { this.operation = null })
    return this.operation
  }

  private publish(phase: UpdateState['phase'], message: string, progress?: number): void {
    if (this.stopped) return
    this.state = { phase, message, automatic: this.state.automatic, downloaded: this.file !== null,
      ...(this.update ? { version: this.update.version } : {}), ...(progress === undefined ? {} : { progress }) }
    this.options.changed(this.snapshot())
  }

  async check(manual = true): Promise<UpdateState> {
    if (!manual && !this.state.automatic) return this.snapshot()
    await this.run(async () => {
      if (this.file) return
      this.publish('checking', nativeText("Checking for Linux updates..."))
      const update = await this.options.find()
      if (this.stopped) return
      this.update = update
      if (!update) { this.publish('idle', nativeText("No newer Linux update is available for this installation.")); return }
      this.publish('available', nativeText("Version {{v0}} is available.", { v0: update.version }))
      if (!manual && !this.state.automatic) return
      if (manual || this.offered !== update.version) {
        this.offered = update.version
        await this.downloadApproved()
      }
    })
    return this.snapshot()
  }

  /** A separate consent precedes download, including when an automatic check found the release. */
  private async downloadApproved(): Promise<void> {
    const update = this.update
    if (!update || this.file || !await this.options.confirm('download', update.version) || this.stopped) return
    this.publish('downloading', nativeText("Downloading version {{v0}}...", { v0: update.version }), 0)
    const file = await this.options.download(update, this.abort.signal, (percent) => {
      this.publish('downloading', nativeText("Downloading version {{v0}}: {{v1}}%", { v0: update.version, v1: percent }), percent)
    })
    if (this.stopped) return
    this.file = file
    this.publish('ready', nativeText("Version {{v0}} is ready to install.", { v0: update.version }))
    await this.installApproved()
  }

  async download(): Promise<UpdateState> {
    await this.run(() => this.downloadApproved())
    return this.snapshot()
  }

  /** Installation/restart needs its own explicit consent; quitting never implicitly installs. */
  private async installApproved(): Promise<void> {
    const update = this.update
    const file = this.file
    if (!update || !file || !await this.options.confirm('install', update.version) || this.stopped) return
    this.publish('installing', nativeText("Installing version {{v0}}...", { v0: update.version }))
    await this.options.install(file, update)
  }

  async install(): Promise<UpdateState> {
    await this.run(() => this.installApproved())
    return this.snapshot()
  }

  stop(): void {
    this.stopped = true
    this.abort.abort()
    if (this.startup) clearTimeout(this.startup)
    if (this.periodic) clearInterval(this.periodic)
  }
}
