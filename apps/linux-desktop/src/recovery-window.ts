/** Packaged recovery settings and alarm audio remain available when the hosted app cannot load. */
import { LINUX_RELEASE_REPOSITORY } from '@persistent/shared'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { once } from 'node:events'
import { serverOrigin } from './security.js'
import { DEFAULT_SERVER, validatedSettings, type SettingsStore } from './settings.js'
import { settingsCatalog } from './settings-catalog.js'
import type { UpdateController, UpdateState } from './update-controller.js'
import { statusNotifierAvailable } from './notifications.js'
import { attachTaskbarHints } from './window-taskbar.js'

interface RecoveryOptions {
  updater: UpdateController
  packageKind: 'AppImage' | 'deb'
  wayland: boolean
  root: string
  version: string
  logDirectory: string
  store: SettingsStore
  openAppSettings(): void
  changeServer(server: string): Promise<void>
  clearSignIn(): Promise<void>
  log(message: string, error?: unknown): void
}

export class RecoveryWindows {
  private settings: BrowserWindow | null = null
  private audio: BrowserWindow
  private audioActive = false
  private audioReady = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private options: RecoveryOptions) {
    this.audio = new BrowserWindow({ show: false, type: 'toolbar', webPreferences: {
      preload: join(options.root, 'dist/local-preload.cjs'), contextIsolation: true, nodeIntegration: false,
      sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required'
    } })
    this.audio.webContents.on('render-process-gone', (_event, details) => {
      this.audioReady = false
      options.log(`Alarm audio renderer exited: ${details.reason}`)
      void this.audio.loadFile(join(options.root, 'resources/audio.html')).catch((error: unknown) => options.log('Alarm audio recovery failed', error))
    })
    this.lockLocal(this.audio)
    void this.audio.loadFile(join(options.root, 'resources/audio.html')).catch((error: unknown) => options.log('Alarm audio could not initialize', error))
    ipcMain.handle('persistent:local', async (event, message: unknown) => {
      if (typeof message !== 'object' || message === null || event.senderFrame !== event.sender.mainFrame) return { error: 'Invalid local request' }
      const raw = message as { type?: string; value?: unknown }
      if (event.sender === this.audio.webContents && event.senderFrame?.url === this.localUrl('audio.html')) {
        if (raw.type === 'audioReady') { this.audioReady = true; this.setAudio(this.audioActive) }
        if (raw.type === 'audioFailed') options.log('Alarm audio playback failed')
        return {}
      }
      if (!this.settings || event.sender !== this.settings.webContents || event.senderFrame?.url !== this.localUrl('connection.html')) return { error: 'Untrusted local request' }
      try {
        switch (raw.type) {
          case 'get': {
            let apps: ReturnType<typeof settingsCatalog> = []
            try { apps = settingsCatalog(options.root) }
            catch (error) { options.log('Publisher catalog could not load', error) }
            return { ...this.snapshot(), apps, trayAvailable: await statusNotifierAvailable() }
          }
          case 'server': {
            const server = serverOrigin(typeof raw.value === 'string' ? raw.value : '')
            if (server === options.store.current.server) return { ...this.snapshot(), message: 'Connection settings saved.' }
            if (!await this.confirmClear()) return { ...this.snapshot(), message: 'Server unchanged.' }
            await options.changeServer(server)
            return { ...this.snapshot(), message: 'Saved and reloaded.' }
          }
          case 'reset':
            if (options.store.current.server === DEFAULT_SERVER) return { ...this.snapshot(), message: 'Using the default server.' }
            if (!await this.confirmClear()) return { ...this.snapshot(), message: 'Server unchanged.' }
            await options.changeServer(DEFAULT_SERVER)
            return { ...this.snapshot(), message: 'Default server restored and reloaded.' }
          case 'clear':
            if (!await this.confirmClear()) return { message: 'Saved sign-in unchanged.' }
            await options.clearSignIn()
            return { message: 'Saved sign-in and personal cached data cleared.' }
          case 'theme':
            options.store.save(validatedSettings({ appTheme: raw.value }, options.store.current))
            return this.snapshot()
          case 'appSettings': options.openAppSettings(); return {}
          // A taskbar-free window must remain recoverable through the tray.
          case 'minimize': this.settings.hide(); return {}
          case 'maximize':
            if (this.settings.isMaximized()) this.settings.unmaximize()
            else this.settings.maximize()
            return this.snapshot()
          case 'close': this.settings.close(); return {}
          case 'logs': {
            const failure = await shell.openPath(options.logDirectory)
            if (failure) throw new Error('The log folder could not be opened.')
            return {}
          }
          case 'updates': {
            return { update: await options.updater.check() }
          }
          case 'updateDownload': return { update: await options.updater.download() }
          case 'updateInstall': return { update: await options.updater.install() }
          case 'updateAutomatic':
            if (typeof raw.value !== 'boolean') return { error: 'Invalid update preference' }
            options.store.save(validatedSettings({ checkUpdatesAutomatically: raw.value }, options.store.current))
            options.updater.setAutomatic(raw.value)
            return { update: options.updater.snapshot() }
          case 'source': await shell.openExternal(`https://github.com/${LINUX_RELEASE_REPOSITORY}`); return {}
          case 'privacy': await shell.openExternal(`${options.store.current.server}/privacy`); return {}
          case 'promo': {
            const link = settingsCatalog(options.root).flatMap((entry) => entry.links).find((link) => link.url === raw.value)
            if (!link) return { error: 'Unknown app destination' }
            await shell.openExternal(link.url)
            return {}
          }
          case 'quit': app.quit(); return {}
          default: return { error: 'Unknown local request' }
        }
      } catch (error) {
        options.log('Local settings action failed', error)
        return { error: error instanceof Error ? error.message : 'The action could not be completed.' }
      }
    })
  }

  private localUrl(file: string): string { return pathToFileURL(join(this.options.root, 'resources', file)).href }

  /** Local theme belongs to the desktop settings window, independently of the hosted app theme. */
  private snapshot(): { server: string; version: string; appTheme: string; maximized: boolean; update: UpdateState } {
    return { server: this.options.store.current.server, version: this.options.version, appTheme: this.options.store.current.appTheme, maximized: this.settings?.isMaximized() ?? false, update: this.options.updater.snapshot() }
  }

  /** Background updater state reaches the local window without rebuilding its page. */
  syncUpdate(): void { this.settings?.webContents.send('persistent:local-state', { update: this.options.updater.snapshot() }) }

  /** Separate native consent for download and restart; neither action proceeds on cancellation. */
  async confirmUpdate(action: 'download' | 'install', version: string): Promise<boolean> {
    // Give every update prompt an owned, taskbar-free parent and a visible
    // recovery route. Page selection preserves the mounted connection form.
    this.open()
    const parent = this.settings!
    if (parent.webContents.isLoadingMainFrame()) {
      await once(parent.webContents, 'did-finish-load', { signal: AbortSignal.timeout(5000) })
    }
    parent.webContents.send('persistent:local-state', { page: 'about' })
    const request = {
      type: 'question' as const, title: 'Persistent update',
      message: action === 'download' ? `Download Persistent version ${version}?` : `Install version ${version} and restart Persistent?`,
      detail: action === 'download' ? 'The app keeps running while the update downloads.' : this.options.packageKind === 'deb'
        ? 'Desktop alerts pause briefly during restart. Installation requests administrator approval. Finish any unsaved edits before restarting.'
        : 'Desktop alerts pause briefly during restart. Your saved sign-in and settings are preserved. Finish any unsaved edits before restarting.',
      buttons: ['Later', action === 'download' ? 'Download update' : 'Install and restart'], defaultId: 0, cancelId: 0
    }
    const result = await dialog.showMessageBox(parent, request)
    return result.response === 1
  }

  /** Local renderers never navigate or spawn windows, even if a packaged script becomes compromised. */
  private lockLocal(window: BrowserWindow): void {
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  }

  open(): void {
    if (this.settings) {
      if (this.settings.isMinimized()) this.settings.restore()
      this.settings.show()
      this.settings.focus()
      return
    }
    const saved = this.options.store.current
    this.settings = new BrowserWindow({ title: 'Persistent', width: saved.settingsWidth ?? 760, height: saved.settingsHeight ?? 600,
      minWidth: 500, minHeight: 400, show: false, type: this.options.wayland ? 'toolbar' : 'normal', transparent: true, frame: false, backgroundColor: '#00000000', icon: join(this.options.root, 'resources/app-icon.png'),
      ...((saved.settingsX !== undefined && saved.settingsY !== undefined) ? { x: saved.settingsX, y: saved.settingsY } : {}), webPreferences: {
      preload: join(this.options.root, 'dist/local-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false
    } })
    if (!this.options.wayland) attachTaskbarHints(this.settings, this.options.log)
    this.settings.once('ready-to-show', () => { this.settings?.show(); this.settings?.focus() })
    this.lockLocal(this.settings)
    this.settings.contentView.setBorderRadius(8)
    const syncFrame = () => {
      if (!this.settings) return
      this.settings.contentView.setBorderRadius(this.settings.isMaximized() ? 0 : 8)
      this.settings.webContents.send('persistent:local-state', this.snapshot())
    }
    this.settings.on('maximize', syncFrame)
    this.settings.on('unmaximize', syncFrame)
    const saveGeometry = () => {
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveGeometry() }, 300)
    }
    this.settings.on('resize', saveGeometry)
    this.settings.on('moved', saveGeometry)
    this.settings.on('close', () => this.saveGeometry())
    this.settings.on('closed', () => { this.settings = null })
    void this.settings.loadFile(join(this.options.root, 'resources/connection.html')).catch((error: unknown) => this.options.log('Recovery settings could not open', error))
  }

  /** Remember the settings window separately from flyout size and placement. */
  private saveGeometry(): void {
    if (!this.settings || this.settings.isDestroyed()) return
    const bounds = this.settings.getNormalBounds()
    try {
      this.options.store.save(validatedSettings({ settingsX: bounds.x, settingsY: bounds.y, settingsWidth: bounds.width, settingsHeight: bounds.height }, this.options.store.current))
    } catch (error) { this.options.log('Settings window geometry could not be saved', error) }
  }

  setAudio(active: boolean): void {
    this.audioActive = active
    if (this.audioReady) this.audio.webContents.send('persistent:audio', active)
  }

  private async confirmClear(): Promise<boolean> {
    const result = await dialog.showMessageBox(this.settings!, {
      type: 'warning', title: 'Clear saved sign-in?',
      message: 'This clears saved sign-in, personal cached data and pending offline changes on this Linux app.',
      buttons: ['Cancel', 'Clear saved sign-in'], defaultId: 0, cancelId: 0
    })
    return result.response === 1
  }

  dispose(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    ipcMain.removeHandler('persistent:local')
    this.settings?.destroy()
    this.audio.destroy()
  }
}
