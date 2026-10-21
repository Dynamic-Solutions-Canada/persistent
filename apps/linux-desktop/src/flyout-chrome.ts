import { localizationSnapshot } from './localization.js'
/** Local, draggable flyout chrome with bounded window actions and hosted-theme colors. */
import { ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

interface ChromeActions {
  back(): void
  pin(): void
  reload(): void
  browser(): void
  connection(): void
  close(): void
}

export class FlyoutChrome {
  private status: 'loading' | 'ready' | 'error' = 'loading'
  private url: string

  constructor(private window: BrowserWindow, root: string, private pinned: () => boolean, private actions: ChromeActions, private colors: { mode: 'light' | 'dark'; background: string }, log: (message: string, error?: unknown) => void) {
    const file = join(root, 'resources/shell.html')
    this.url = pathToFileURL(file).href
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    ipcMain.on('persistent:chrome', this.onAction)
    void window.loadFile(file).catch((error: unknown) => log('Flyout chrome could not load', error))
  }

  /** Only this packaged renderer may invoke the fixed action list, never the hosted page or a popup. */
  private onAction = (event: IpcMainEvent, action: unknown): void => {
    if (event.sender !== this.window.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame?.url !== this.url) return
    switch (action) {
      case 'ready': this.sync(); return
      case 'back': this.actions.back(); return
      case 'pin': this.actions.pin(); return
      case 'reload': this.actions.reload(); return
      case 'browser': this.actions.browser(); return
      case 'connection': this.actions.connection(); return
      case 'close': this.actions.close(); return
      default: return
    }
  }

  /** Echo authoritative pin, loading and appearance state to the local icon toolbar. */
  sync(): void {
    if (!this.window.isDestroyed()) this.window.webContents.send('persistent:chrome-state', {
      pinned: this.pinned(), ...this.colors, status: this.status, localization: localizationSnapshot()
    })
  }

  setStatus(status: 'loading' | 'ready' | 'error'): void { this.status = status; this.sync() }
  appearance(colors: { mode: 'light' | 'dark'; background: string }): void { this.colors = colors; this.sync() }
  dispose(): void { ipcMain.removeListener('persistent:chrome', this.onAction) }
}
