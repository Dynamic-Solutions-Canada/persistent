/** Recreate Electron's tray adapter when a desktop watcher returns after lock or shell restart. */
import { Tray, nativeImage, type Menu, type Rectangle } from 'electron'
import { statusNotifierAvailable } from './notifications.js'
import { activationAnchor } from './window-placement.js'

export class ResidentTray {
  private tray: Tray
  private available = false
  private disposed = false
  private checking = false
  private monitor: ReturnType<typeof setInterval>

  constructor(private icon: string, private menu: Menu, private activate: (bounds?: Rectangle) => void, private log: (message: string, error?: unknown) => void) {
    this.tray = this.create()
    this.monitor = setInterval(() => { void this.check() }, 10_000)
    void this.check()
  }

  private create(): Tray {
    const tray = new Tray(nativeImage.createFromPath(this.icon).resize({ width: 32, height: 32 }))
    tray.setToolTip('Persistent')
    tray.setContextMenu(this.menu)
    tray.on('click', (_event, bounds, position) => {
      this.activate(activationAnchor(bounds, position))
    })
    return tray
  }

  /** A startup while locked can select Electron's XEmbed fallback. Recreate when StatusNotifier returns. */
  private async check(): Promise<void> {
    if (this.checking || this.disposed) return
    this.checking = true
    try {
      const available = await statusNotifierAvailable()
      if (this.disposed) return
      if (available && !this.available) {
        this.tray.destroy()
        this.tray = this.create()
        this.log('Desktop tray service available; tray registration refreshed')
      }
      this.available = available
    } catch (error) {
      this.log('Tray recovery check failed', error)
    } finally {
      this.checking = false
    }
  }

  getBounds(): Rectangle { return this.tray.getBounds() }

  destroy(): void {
    this.disposed = true
    clearInterval(this.monitor)
    this.tray.destroy()
  }
}
