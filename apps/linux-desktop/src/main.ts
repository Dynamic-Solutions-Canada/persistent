/** Linux resident host. Native delivery consumes shared server projections; the hosted app owns management. */
import { app, dialog, ipcMain, Menu, net, powerMonitor, session, shell } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { ProfileSession } from './profile-session.js'
import { BackgroundClient } from './background-client.js'
import { NotificationEngine } from './notification-engine.js'
import { LinuxNotifications, statusNotifierAvailable } from './notifications.js'
import { Autostart, SettingsStore } from './settings.js'
import { HostedWindow } from './hosted-window.js'
import { RecoveryWindows } from './recovery-window.js'
import { ResidentTray } from './resident-tray.js'
import { HostSettings } from './host-settings.js'
import { UpdateController } from './update-controller.js'
import { findLinuxUpdate } from './release-check.js'
import { downloadUpdate } from './update-download.js'
import { installUpdate } from './update-install.js'
import { installedPackageKind } from './installed-package.js'
import { installImage } from '../scripts/install.js'

app.setName('Persistent')
app.setPath('userData', join(app.getPath('appData'), 'persistent-linux'))
app.setDesktopName('ca.persistent.desktop.desktop')
// X11/XWayland permits tray-adjacent placement for Windows flyout parity.
// Explicit native Wayland remains available with compositor-controlled placement.
if (process.platform === 'linux' && !app.commandLine.hasSwitch('ozone-platform')) {
  app.commandLine.appendSwitch('ozone-platform', 'x11')
}
const root = resolve(__dirname, '..')
const logDirectory = join(app.getPath('userData'), 'logs')
mkdirSync(logDirectory, { recursive: true, mode: 0o700 })

/** Keep diagnostics bounded and free of tokens, server response bodies and reminder text. */
function log(message: string, error?: unknown): void {
  const detail = error instanceof Error ? ` (${error.name})` : ''
  const line = `${new Date().toISOString()} ${message}${detail}\n`
  console.error(line.trim())
  try {
    const file = join(logDirectory, 'host.log')
    if (existsSync(file) && statSync(file).size > 1_000_000) renameSync(file, `${file}.previous`)
    appendFileSync(file, line, { mode: 0o600 })
  } catch { console.error('Linux host log could not be written') }
}

let hosted: HostedWindow | null = null
let shutdown: (() => Promise<void>) | null = null
let quitting = false
if (process.platform !== 'linux') {
  console.error('This application is the Linux host. Use apps/desktop for Windows.')
  app.exit(1)
} else if (!app.requestSingleInstanceLock()) {
  if (process.argv.includes('--install')) dialog.showErrorBox('Persistent is running', 'Quit Persistent before running the AppImage installer.')
  app.exit(0)
} else {
  process.on('SIGTERM', () => app.quit())
  process.on('SIGINT', () => app.quit())
  app.on('second-instance', () => hosted?.show())
  app.on('window-all-closed', () => { /* Closing management windows keeps the tray process resident. */ })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void shutdown?.().finally(() => app.quit())
    if (!shutdown) app.quit()
  })
  void app.whenReady().then(start).catch((error: unknown) => {
    log('Linux host startup failed', error)
    dialog.showErrorBox('Persistent could not start', 'The Linux host could not initialize. Check its log folder under persistent-linux in your user configuration directory.')
    quitting = true
    app.quit()
  })
}

/** Wire authenticated profile access, windows, native notifications, settings and process cleanup. */
async function start(): Promise<void> {
  if (process.argv.includes('--install')) {
    if (!app.isPackaged || !process.env.APPIMAGE) throw new Error('Run the AppImage with --install to install it for this user.')
    const destination = await installImage(process.env.APPIMAGE, process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), process.arch, join(process.resourcesPath, 'icon.png'))
    app.relaunch({ execPath: destination, args: process.argv.slice(1).filter((argument) => argument !== '--install') })
    app.quit()
    return
  }
  const store = new SettingsStore(app.getPath('userData'), log)
  const profile = session.fromPartition('persist:persistent')
  const authentication = new ProfileSession(profile.cookies, () => store.current.server, log)
  // The PWA deliberately has no notification channel. No remote page receives OS permissions through this host.
  profile.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  profile.setPermissionCheckHandler(() => false)
  const ozone = app.commandLine.getSwitchValue('ozone-platform')
  const wayland = ozone === 'wayland' || ozone !== 'x11' && Boolean(process.env.WAYLAND_DISPLAY)
  const startup = new Autostart(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), process.env.APPIMAGE || process.execPath, app.isPackaged ? [] : [app.getAppPath()])
  hosted = new HostedWindow(profile, store, root, wayland, log, () => settings.send(), (action) => {
    if (action === 'pin') void settings.apply({ pinFlyout: !store.current.pinFlyout })
    else recovery.open()
  })
  const window = hosted
  let clearingProfile = false
  const installedKind = await installedPackageKind(app.isPackaged, process.env.APPIMAGE, process.execPath)
  const kind = installedKind ?? 'AppImage'
  const canInstall = installedKind !== null
  const publicFetch = (input: string, init?: RequestInit) => net.fetch(input, init)
  const updater = new UpdateController({
    automatic: store.current.checkUpdatesAutomatically,
    find: () => findLinuxUpdate(app.getVersion(), process.arch, kind, publicFetch),
    confirm: async (action, version) => {
      if (!canInstall) throw new Error('Install and run an AppImage or Debian package to use in-app updates.')
      return recovery.confirmUpdate(action, version)
    },
    download: (update, signal, progress) => downloadUpdate(update, join(app.getPath('userData'), 'updates'), publicFetch, signal, progress),
    install: async (file, update) => {
      await installUpdate(file, update, process.arch, process.env.APPIMAGE)
      if (!quitting) {
        app.relaunch({ args: process.argv.slice(1), ...(process.env.APPIMAGE ? { execPath: process.env.APPIMAGE } : {}) })
        app.quit()
      }
    },
    changed: () => recovery.syncUpdate(), log
  })
  const recovery = new RecoveryWindows({
    updater,
    packageKind: kind,
    wayland,
    root, version: app.getVersion(), logDirectory, store, openAppSettings: () => window.navigate('/settings'), log,
    changeServer: async (server) => {
      await clearSignIn()
      store.save({ ...store.current, server })
      await window.load()
    },
    clearSignIn: async () => { await clearSignIn(); await window.load() }
  })
  // The notification daemon cannot read Electron ASAR paths; give it a physical bundled icon.
  const icon = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(root, 'resources/icon.png')
  const notifications = new LinuxNotifications(icon, log)
  const engine = new NotificationEngine({
    show: (alarm, id, confirming, audible) => notifications.show(alarm, id, confirming, audible),
    close: (id) => notifications.close(id), audio: (active) => recovery.setAudio(active),
    open: (reminderId, occurrenceId) => window.openReminder(reminderId, occurrenceId),
    write: (id, action) => client.write(id, action),
    error: (message) => {
      log(message)
      if (message.startsWith('The reminder action')) void dialog.showMessageBox(window.window, { type: 'warning', title: 'Check reminder action', message })
    }
  })
  const client = new BackgroundClient({
    origin: () => store.current.server,
    cookie: () => authentication.cookieHeader(),
    request: (path, init) => profile.fetch(new URL(path, store.current.server).href, { ...init, credentials: 'include', redirect: 'error', cache: 'no-store' }),
    log
  }, engine)
  notifications.onAction = (id, action) => { void engine.action(id, action) }
  notifications.onClosed = (id, reason) => engine.closed(id, reason)
  notifications.onRestart = () => engine.daemonRestarted()

  /** Clear the complete private profile, including personal offline cache and pending writes. */
  async function clearSignIn(): Promise<void> {
    clearingProfile = true
    client.sessionChanged(true)
    window.clearPending()
    await window.webContents.loadURL('about:blank')
    try {
      await profile.clearStorageData()
      await profile.clearCache()
      await profile.clearAuthCache()
    } finally {
      authentication.forget()
      clearingProfile = false
    }
  }

  /** Native registration failure corrects the toggle instead of leaving an enabled but inert surface. */
  async function enableNotifications(enabled: boolean): Promise<boolean> {
    if (!enabled) { client.stop(); return false }
    try {
      await notifications.connect()
      client.start()
      return true
    } catch (error) {
      client.stop()
      log('Linux notification registration failed', error)
      dialog.showErrorBox('Linux notifications unavailable', 'Persistent needs a working desktop notification service with action support. Notifications remain off. Check your desktop session and app log, then try again.')
      return false
    }
  }
  const settings = new HostSettings(store, startup, window, enableNotifications, log)
  let bridgeQueue = Promise.resolve()
  ipcMain.on('persistent:host', (event, message: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame || !window.trusted(event.senderFrame?.url ?? '')) return
    if (typeof message !== 'object' || message === null) return
    const raw = message as { type?: string; settings?: unknown; mode?: string; background?: string }
    if (raw.type === 'signedOut') {
      client.sessionChanged(true)
      window.clearPending()
      return
    }
    if (raw.type === 'signedIn') {
      client.sessionConfirmed()
      return
    }
    // Serialize settings changes so slow native registration cannot overwrite a later toggle.
    bridgeQueue = bridgeQueue.then(async () => {
      switch (raw.type) {
        case 'pageReady': window.ready(); settings.send(); return
        case 'notificationActionsReady': window.ready(true); return
        case 'notificationActionsGone': window.actionsGone(); return
        case 'getHostSettings': settings.send(); return
        case 'setHostSettings': await settings.apply(raw.settings); return
        case 'openHostSettings': recovery.open(); return
        case 'close': window.hide(); return
        case 'signedOut': client.sessionChanged(true); window.clearPending(); return
        case 'appearance':
          if (typeof raw.background === 'string' && typeof raw.mode === 'string') window.appearance(raw.mode, raw.background)
          return
        default: return
      }
    }).catch((error: unknown) => log('Hosted bridge request failed', error))
  })
  await authentication.watch((paused) => {
    if (!clearingProfile) {
      window.discardPending()
      client.sessionChanged(paused)
    }
  })
  powerMonitor.on('resume', () => { client.resume(); window.send({ type: 'checkForUpdate' }) })
  const menu = Menu.buildFromTemplate([
    { label: 'Open Persistent', click: () => window.show(tray.getBounds()) },
    { label: 'Open in browser', click: () => { void shell.openExternal(store.current.server).catch((error: unknown) => log('Browser could not open', error)) } },
    { type: 'separator' },
    { label: 'Reload', click: () => { void window.load() } },
    { label: 'Settings', click: () => recovery.open() },
    { type: 'separator' },
    { label: 'Exit', click: () => app.quit() }
  ])
  const tray = new ResidentTray(icon, menu, (bounds) => window.toggle(bounds), log)
  Menu.setApplicationMenu(null)
  shutdown = async () => {
    updater.stop()
    client.stop()
    await engine.reset()
    notifications.dispose()
    authentication.dispose()
    tray.destroy()
    recovery.dispose()
    window.dispose()
  }
  if (store.current.notifications) store.save({ ...store.current, notifications: await enableNotifications(true) })
  settings.send()
  if (canInstall) updater.start()
  // Delivery and updates must not wait for a slow or failed hosted document.
  void window.load()
  // Always retain a launcher-accessible window. The first run is visible even without a tray extension.
  // Explicit autostart may hide only after a nonempty tray geometry is available; Wayland often supplies none.
  if (!process.argv.includes('--background') || !await statusNotifierAvailable()) window.show(tray.getBounds())
  log(`Linux host ready (${wayland ? 'Wayland' : 'X11'} window policy)`)
}
