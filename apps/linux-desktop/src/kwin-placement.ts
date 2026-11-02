/** Transient KWin placement for this process's flyout; never changes desktop rules or other windows. */
import dbus from '@particle/dbus-next'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openingPosition, panelCornerAnchor, type Rectangle } from './window-placement.js'

export interface KwinPlacement {
  pid: number
  title: string
  placement: 'tray' | 'last' | 'center'
  anchor?: Rectangle
  saved?: { x: number; y: number }
}
interface Output { geometry: Rectangle; devicePixelRatio?: number }
interface Signal { connect(callback: () => void): void }
interface Window {
  pid: number; caption: string; frameGeometry: Rectangle; captionChanged: Signal
  frameGeometryChanged: Signal; interactiveMoveResizeStarted: Signal
  skipTaskbar: boolean; skipPager: boolean; skipSwitcher: boolean; keepAbove: boolean
}
interface Workspace {
  screens: Output[]; activeScreen: Output; currentDesktop: unknown
  windowList(): Window[]
  windowAdded: { connect(callback: (window: Window) => void): void }
  clientArea(kind: number, output: Output, desktop: unknown): Rectangle
}

/** Serialized into KWin's ES2016 engine (no object spread). Dependencies are explicit arguments. */
function runPlacement(workspace: Workspace, KWin: { PlacementArea: number }, config: KwinPlacement,
  position: typeof openingPosition, panelAnchor: typeof panelCornerAnchor): void {
  const handlers = {
    place(window: Window): void {
      if (window.pid !== config.pid || window.caption !== config.title) return
      let output = workspace.activeScreen
      let anchor: Rectangle | undefined
      if (config.anchor) {
        // Plasma's StatusNotifier activation is in native pixels. Follow Little
        // Launcher's per-output conversion, including mixed DPI and negative origins.
        for (const candidate of workspace.screens) {
          const bounds = candidate.geometry
          const scale = candidate.devicePixelRatio || 1
          const x = bounds.x + (config.anchor.x - bounds.x) / scale
          const y = bounds.y + (config.anchor.y - bounds.y) / scale
          if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height) {
            output = candidate
            anchor = { x, y, width: config.anchor.width / scale, height: config.anchor.height / scale }
            break
          }
        }
      }
      if (!output) return
      const area = workspace.clientArea(KWin.PlacementArea, output, workspace.currentDesktop)
      const geometry = window.frameGeometry
      const size = { width: Math.min(geometry.width, area.width - 24), height: Math.min(geometry.height, area.height - 24) }
      const point = position(area, size, config.placement, anchor || panelAnchor(output.geometry, area), config.saved)
      window.skipTaskbar = true
      window.skipPager = true
      window.skipSwitcher = true
      window.keepAbove = true
      // Wayland configure/commit is asynchronous. KWin can center a later
      // committed frame after our initial request; only write when it differs.
      if (geometry.x !== point.x || geometry.y !== point.y || geometry.width !== size.width || geometry.height !== size.height) {
        window.frameGeometry = { x: point.x, y: point.y, width: size.width, height: size.height }
      }
    },
    watch(window: Window): void {
      if (window.pid !== config.pid) return
      let manual = false
      let applying = false
      const changes = {
        reconcile(): void {
          if (manual || applying) return
          applying = true
          try { handlers.place(window) } finally { applying = false }
        },
        userMoved(): void { manual = true }
      }
      window.frameGeometryChanged.connect(changes.reconcile)
      window.captionChanged.connect(changes.reconcile)
      // Stop correcting once the user grabs this mapped window. A later tray
      // opening gets a new script and anchors it again.
      window.interactiveMoveResizeStarted.connect(changes.userMoved)
      changes.reconcile()
    }
  }
  workspace.windowAdded.connect(handlers.watch)
  workspace.windowList().forEach(handlers.watch)
}

export function kwinPlacementScript(config: KwinPlacement): string {
  return `(${runPlacement.toString()})(workspace,KWin,${JSON.stringify(config)},${openingPosition.toString()},${panelCornerAnchor.toString()});`
}

interface Scripting {
  unloadScript(name: string): Promise<boolean>
}

/** Each open replaces only our own script. Closing the app unloads it and removes its private file. */
export class KwinFlyoutPlacement {
  private bus: dbus.MessageBus | undefined
  private directory: string | undefined
  private scripting: Scripting | undefined
  private pending: Promise<void> = Promise.resolve()
  private stopped = false
  private failed = false
  private readonly name = `persistent-flyout-${process.pid}`

  constructor(private userData: string, private log: (message: string, error?: unknown) => void) {}

  place(config: Omit<KwinPlacement, 'pid'>): void {
    if (this.stopped || this.failed) return
    this.pending = this.pending.then(async () => {
      if (this.stopped) return
      if (!this.bus) {
        this.bus = dbus.sessionBus()
        this.bus.on('error', (error: unknown) => this.fail(error))
        const proxy = await this.bus.getProxyObject('org.kde.KWin', '/Scripting')
        this.scripting = proxy.getInterface('org.kde.kwin.Scripting') as unknown as Scripting
        this.directory = await mkdtemp(join(this.userData, 'kwin-flyout-'))
      }
      await this.scripting!.unloadScript(this.name)
      const file = join(this.directory!, 'placement.js')
      await writeFile(file, kwinPlacementScript({ ...config, pid: process.pid }), { mode: 0o600 })
      // dbus-next's proxy cannot disambiguate KWin's overloaded loadScript.
      const reply = await this.bus.call(new dbus.Message({ destination: 'org.kde.KWin', path: '/Scripting',
        interface: 'org.kde.kwin.Scripting', member: 'loadScript', signature: 'ss', body: [file, this.name] }))
      const id = reply?.body[0] as number
      if (!Number.isInteger(id) || id < 0) throw new Error('KWin did not load the flyout placement script')
      const proxy = await this.bus.getProxyObject('org.kde.KWin', `/Scripting/Script${id}`)
      await (proxy.getInterface('org.kde.kwin.Script') as unknown as { run(): Promise<void> }).run()
    }).catch((error: unknown) => this.fail(error))
  }

  private fail(error: unknown): void {
    if (!this.failed) this.log('KWin flyout placement unavailable; using compositor placement', error)
    this.failed = true
    this.bus?.disconnect()
  }

  async dispose(): Promise<void> {
    this.stopped = true
    // A missing/unresponsive compositor must never hold up application exit.
    await Promise.race([this.pending.then(async () => {
      if (!this.failed) await this.scripting?.unloadScript(this.name)
    }).catch(() => {}), new Promise<void>((resolve) => { const timer = setTimeout(resolve, 1500); timer.unref() })])
    this.bus?.disconnect()
    if (this.directory) await rm(this.directory, { recursive: true, force: true })
  }
}
