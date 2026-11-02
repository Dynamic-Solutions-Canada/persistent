import { nativeText } from './localization.js'
/** One warm hosted view moves between the standard sign-in window and reusable tray flyout. */
import { BrowserWindow, Menu, WebContentsView, ipcMain, nativeTheme, screen, shell, type IpcMainEvent, type Session, type WebContents } from 'electron'
import { join } from 'node:path'
import { FlyoutChrome } from './flyout-chrome.js'
import { PageDelivery } from './page-delivery.js'
import { attachTaskbarHints } from './window-taskbar.js'
import { activationAnchor, openingPosition, panelCornerAnchor } from './window-placement.js'
import { isAppUrl, isExternalUrl, isGoogleSignIn } from './security.js'
import type { SettingsStore } from './settings.js'

export class HostedWindow {
  private readonly flyoutWindow: BrowserWindow
  private readonly signInWindow: BrowserWindow
  get window(): BrowserWindow { return this.signedIn ? this.flyoutWindow : this.signInWindow }
  readonly webContents: WebContents
  private view: WebContentsView
  private chrome: FlyoutChrome
  private mode: 'light' | 'dark' = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  private background = this.mode === 'dark' ? '#0b0f19' : '#ffffff'
  private delivery: PageDelivery
  private lastHidden = 0
  private resizeTimer: ReturnType<typeof setTimeout> | null = null
  private status: 'loading' | 'ready' | 'error' = 'loading'
  private signedIn = false
  private popups = new Set<BrowserWindow>()

  constructor(
    profile: Session,
    private store: SettingsStore,
    private root: string,
    readonly wayland: boolean,
    private log: (message: string, error?: unknown) => void,
    private settingsChanged: () => void,
    private hostAction: (action: 'pin' | 'connection') => void,
    private placeWaylandFlyout?: (title: string, trayBounds?: Electron.Rectangle) => void
  ) {
    const current = store.current
    this.flyoutWindow = new BrowserWindow({
      title: 'Persistent', width: current.width, height: current.height, useContentSize: true,
      minWidth: 320, minHeight: 400, show: false, frame: false, type: wayland ? 'toolbar' : 'normal', skipTaskbar: true, transparent: true, backgroundColor: '#00000000', icon: join(root, 'resources/app-icon.png'),
      webPreferences: { preload: join(root, 'dist/shell-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false }
    })
    // The KWin helper matches a friendly, host-owned title and this process ID.
    this.flyoutWindow.setTitle(`Persistent - ${nativeText('Reminders')}`)
    this.flyoutWindow.on('page-title-updated', (event) => event.preventDefault())
    const area = screen.getPrimaryDisplay().workArea
    this.signInWindow = new BrowserWindow({
      title: 'Persistent', width: Math.min(540, area.width - 24), height: Math.min(760, area.height - 24),
      minWidth: 320, minHeight: 400, show: false,
      icon: join(root, 'resources/app-icon.png'), backgroundColor: this.background,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
    })
    this.signInWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.signInWindow.webContents.on('will-navigate', (event) => event.preventDefault())
    this.signInMenu()
    if (!wayland) attachTaskbarHints(this.flyoutWindow, log)
    this.view = new WebContentsView({ webPreferences: { session: profile, preload: join(root, 'dist/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } })
    this.webContents = this.view.webContents
    this.delivery = new PageDelivery((message) => this.send(message))
    // Windows uses DWM's 8-DIP rounding. Clip the entire native view tree so
    // hosted content cannot paint square corners over the rounded local frame.
    this.flyoutWindow.contentView.setBorderRadius(8)
    this.window.contentView.addChildView(this.view)
    this.view.setBackgroundColor(this.background)
    this.layout()
    this.chrome = new FlyoutChrome(this.flyoutWindow, root, () => store.current.pinFlyout, {
      back: () => this.send({ type: 'back' }), pin: () => this.hostAction('pin'),
      reload: () => { void this.load() }, connection: () => this.hostAction('connection'), close: () => this.hide(),
      browser: () => this.openExternal(this.trusted(this.webContents.getURL()) ? this.webContents.getURL() : store.current.server)
    }, { mode: this.mode, background: this.background }, log)
    ipcMain.on('persistent:external', this.onExternal)
    for (const window of [this.signInWindow, this.flyoutWindow]) {
      window.on('close', (event) => { event.preventDefault(); window.hide() })
      window.on('resize', () => this.layout())
      const visibility = () => {
        if (window === this.window) this.syncVisibility()
      }
      window.on('show', visibility)
      window.on('hide', visibility)
      window.on('minimize', visibility)
      window.on('restore', visibility)
    }
    this.flyoutWindow.on('blur', () => {
      if (this.signedIn && !this.store.current.pinFlyout && this.popups.size === 0) this.hide()
    })
    this.flyoutWindow.on('resize', () => {
      this.layout()
      if (this.resizeTimer) clearTimeout(this.resizeTimer)
      this.resizeTimer = setTimeout(() => {
        const [width = 420, height = 680] = this.flyoutWindow.getContentSize()
        try {
          this.store.save({ ...this.store.current, width: Math.max(320, Math.min(1200, width)), height: Math.max(400, Math.min(1600, height)) })
          this.settingsChanged()
        } catch (error) { this.log('Window size could not be saved', error) }
      }, 300)
    })
    this.flyoutWindow.on('moved', () => {
      if (this.wayland) return
      const [x, y] = this.flyoutWindow.getPosition()
      try { this.store.save({ ...this.store.current, x, y }) }
      catch (error) { this.log('Window position could not be saved', error) }
    })
    this.webContents.on('did-start-navigation', (details) => this.delivery.navigating(details))
    this.webContents.on('will-navigate', (details) => this.guardNavigation(details, details.url))
    this.webContents.on('will-redirect', (details) => this.guardNavigation(details, details.url))
    this.webContents.on('render-process-gone', (_event, details) => {
      this.log(`Hosted renderer exited: ${details.reason}`)
      this.setStatus('error')
    })
    this.webContents.setWindowOpenHandler(({ url }) => {
      if (isAppUrl(url, this.store.current.server) || isGoogleSignIn(url)) {
        return { action: 'allow', overrideBrowserWindowOptions: {
          title: nativeText('Persistent sign-in'), width: 540, height: 740, parent: this.window,
          webPreferences: { session: profile, contextIsolation: true, sandbox: true, nodeIntegration: false, preload: join(root, 'dist/external-preload.cjs'), additionalArguments: [`--persistent-server-origin=${store.current.server}`] }
        } }
      }
      // Trusted anchor clicks use the preload's private channel. A script
      // window.open request must not open the user's browser on its own.
      return { action: 'deny' }
    })
    this.webContents.on('did-create-window', (popup) => {
      this.popups.add(popup)
      if (!this.wayland) attachTaskbarHints(popup, this.log)
      popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      popup.webContents.on('will-navigate', (details) => this.guardNavigation(details, details.url))
      popup.webContents.on('will-redirect', (details) => this.guardNavigation(details, details.url))
      popup.on('closed', () => { this.popups.delete(popup); this.show() })
    })
  }

  /** Move the warm hosted view between a standard sign-in window and the separate flyout. */
  setSignedIn(signedIn: boolean): void {
    if (this.signedIn === signedIn) return
    const previous = this.window
    const visible = previous.isVisible() || previous.isMinimized()
    previous.contentView.removeChildView(this.view)
    previous.hide()
    this.signedIn = signedIn
    this.window.contentView.addChildView(this.view)
    this.view.setBorderRadius(signedIn ? 7 : 0)
    this.layout()
    if (visible) this.show()
    else this.view.setVisible(this.status === 'ready')
    this.log(signedIn ? 'Hosted presentation changed to flyout' : 'Hosted presentation changed to sign-in window')
  }

  private signInMenu(): void {
    this.signInWindow.setMenu(Menu.buildFromTemplate([{ label: nativeText('Settings'), submenu: [
      { label: nativeText('Connection settings'), click: () => this.hostAction('connection') },
      { label: nativeText('Reload'), click: () => { void this.load() } }
    ] }]))
  }

  /** Only the main app frame may use the host bridge, even when Google sign-in navigates the window. */
  trusted(url: string): boolean { return isAppUrl(url, this.store.current.server) }

  private guardNavigation(event: { preventDefault(): void }, url: string): void {
    if (this.trusted(url) || isGoogleSignIn(url)) return
    event.preventDefault()
    this.log('Blocked navigation outside the configured app and Google sign-in origins')
  }

  /** The page cannot call this private channel; only trusted preload link events send it. */
  private onExternal = (event: IpcMainEvent, value: unknown): void => {
    const popup = [...this.popups].find((entry) => entry.webContents === event.sender)
    const managed = event.sender === this.webContents || popup !== undefined
    const url = event.senderFrame?.url ?? ''
    if (!managed || event.senderFrame !== event.sender.mainFrame || !(this.trusted(url) || popup && isGoogleSignIn(url))) return
    if (typeof value === 'string' && value.length <= 8192) this.openExternal(value)
  }

  private openExternal(url: string): void {
    if (isExternalUrl(url) || this.trusted(url)) void shell.openExternal(url).catch((error: unknown) => this.log('Could not open browser link', error))
  }

  async load(): Promise<void> {
    this.setSignedIn(false)
    this.setStatus('loading')
    try {
      await this.webContents.loadURL(this.store.current.server)
      this.setStatus('ready')
    } catch (error) {
      this.log('Hosted app could not load; Connection and Reload remain available', error)
      this.setStatus('error')
    }
  }

  /** Lay out the hosted view beneath local chrome without changing the web app's viewport model. */
  private layout(): void {
    const [width = 420, height = 680] = this.window.getContentSize()
    this.view.setBounds(this.signedIn
      ? { x: 1, y: 37, width: Math.max(1, width - 2), height: Math.max(1, height - 38) }
      : { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) })
  }

  private setStatus(status: 'loading' | 'ready' | 'error'): void {
    this.status = status
    this.view.setVisible(status === 'ready')
    this.chrome.setStatus(status)
    if (status !== 'ready') {
      // This local document has no preload or privileged bridge. Native Settings
      // and Reload remain available even if the hosted page cannot load.
      const title = nativeText(status === 'error' ? "Can't reach Persistent" : 'Loading Persistent')
      const safeTitle = title.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!)
      void this.signInWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<title>Persistent</title><body style="font:16px system-ui;padding:24px"><h1>${safeTitle}</h1></body>`)}`)
        .catch((error: unknown) => this.log('Sign-in status could not load', error))
    }
  }

  /** Keep the toolbar pin state in step with hosted Settings. */
  syncChrome(): void { this.chrome.sync(); this.signInMenu() }

  appearance(mode: string, background: string): void {
    if (!['light', 'dark'].includes(mode) || !/^#[0-9a-f]{6}$/i.test(background)) return
    this.mode = mode as 'light' | 'dark'
    this.background = background
    this.view.setBackgroundColor(background)
    this.chrome.appearance({ mode: this.mode, background })
  }

  /** Host messages preserve the mounted page. Notification actions wait for the listener that consumes them. */
  send(message: unknown): void {
    if (!this.window.isDestroyed() && this.trusted(this.webContents.getURL())) this.webContents.send('persistent:page', message)
  }

  ready(actions = false): void { this.delivery.ready(actions) }
  actionsGone(): void { this.delivery.actionsGone() }

  /** A Snooze click opens the existing picker over any current screen, preserving an editor draft. */
  openReminder(reminderId: string, snoozeOccurrenceId?: string): void {
    this.delivery.queue(snoozeOccurrenceId
      ? { type: 'snoozeOccurrence', occurrenceId: snoozeOccurrenceId }
      : { type: 'navigate', path: `/reminders/${encodeURIComponent(reminderId)}` })
    this.show()
    this.delivery.flush()
  }

  /** Fence a queued notification request on token replacement without changing listener readiness. */
  discardPending(): void { this.delivery.discard() }

  /** Clear personal pending actions and authentication popups before changing accounts or server. */
  clearPending(): void {
    this.delivery.signedOut()
    for (const popup of this.popups) popup.destroy()
    this.popups.clear()
  }

  /** Queue Settings and other host navigation until the routing listener is attached. */
  navigate(path: string): void {
    this.delivery.queue({ type: 'navigate', path })
    this.show()
    this.delivery.flush()
  }

  show(trayBounds?: Electron.Rectangle): void {
    if (this.window.isMinimized()) this.window.restore()
    if (this.signedIn && !this.window.isVisible() && !this.wayland) this.position(trayBounds)
    this.window.show()
    if (this.signedIn && this.wayland) this.placeWaylandFlyout?.(this.flyoutWindow.getTitle(), trayBounds)
    this.syncVisibility()
    this.view.setVisible(this.status === 'ready')
    this.window.focus()
    this.webContents.focus()
    this.send({ type: 'checkForUpdate' })
  }

  toggle(trayBounds?: Electron.Rectangle): void {
    if (this.window.isVisible() && this.signedIn) this.hide()
    else if (this.window.isVisible()) this.show(trayBounds)
    else if (Date.now() - this.lastHidden > 350) this.show(trayBounds)
    else this.lastHidden = 0
  }

  hide(): void {
    if (!this.window.isVisible()) return
    this.lastHidden = Date.now()
    this.window.hide()
  }

  /** Reparented Chromium views can retain the previous shell's hidden lifecycle.
   * Explicit foreground rendering restores visibility/painting; hidden and
   * minimized windows still use Chromium's normal background throttling. */
  private syncVisibility(): void {
    this.webContents.setBackgroundThrottling(!this.window.isVisible() || this.window.isMinimized())
  }

  /** X11 positioning stays inside the selected display. Wayland placement belongs to its compositor. */
  private position(trayBounds?: Electron.Rectangle): void {
    const current = this.store.current
    const point = screen.getCursorScreenPoint()
    const reported = trayBounds ? activationAnchor(trayBounds) : undefined
    const clickedDisplay = reported ? screen.getDisplayMatching(reported) : screen.getDisplayNearestPoint(point)
    // Unlike Windows, Linux often gives a zero placeholder instead of icon bounds.
    // The cursor still chooses the monitor; its reserved panel edge chooses the corner.
    const anchor = reported ?? panelCornerAnchor(clickedDisplay.bounds, clickedDisplay.workArea)
    const saved = current.x !== undefined && current.y !== undefined ? { x: current.x, y: current.y } : undefined
    const [width = 420, height = 680] = this.window.getSize()
    const display = current.placement === 'last' && saved
      ? screen.getDisplayMatching({ ...saved, width, height }) : clickedDisplay
    const fitted = { width: Math.min(width, display.workArea.width - 24), height: Math.min(height, display.workArea.height - 24) }
    if (fitted.width !== width || fitted.height !== height) this.window.setSize(fitted.width, fitted.height)
    const position = openingPosition(display.workArea, fitted, current.placement, anchor, saved)
    this.window.setPosition(position.x, position.y)
  }

  dispose(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer)
    this.clearPending()
    this.chrome.dispose()
    ipcMain.removeListener('persistent:external', this.onExternal)
    this.webContents.close()
    this.signInWindow.destroy()
    this.flyoutWindow.destroy()
  }
}
