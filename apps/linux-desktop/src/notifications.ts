/** Freedesktop notification adapter; the daemon controls display, DND, and action layout. */
import dbus from '@particle/dbus-next'
import type { EventEmitter } from 'node:events'
import { NotificationHandles, type NotificationOwner } from './notification-handles.js'
import type { PresentedAlarm } from './projection.js'

interface NotificationInterface extends EventEmitter {
  GetCapabilities(): Promise<string[]>
  Notify(app: string, replaces: number, icon: string, title: string, body: string, actions: string[], hints: Record<string, dbus.Variant>, timeout: number): Promise<number>
  CloseNotification(id: number): Promise<void>
}

/** Escape server display strings because notification daemons may interpret body markup. */
export function escapeBody(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Bound a daemon call; an eventual result from an expired publication can still be cleaned up. */
async function bounded<T>(promise: Promise<T>, milliseconds: number, late?: (result: T) => void): Promise<T> {
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  void promise.then((result) => { if (expired) late?.(result) }, () => {})
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error('Desktop notification service timed out')) }, milliseconds)
    })])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Freedesktop tray service discovery, used only to choose a safe autostart visibility fallback. */
export async function statusNotifierAvailable(): Promise<boolean> {
  let bus: dbus.MessageBus | null = null
  try {
    bus = dbus.sessionBus()
    bus.on('error', () => {})
    const proxy = await bounded(bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus'), 5000)
    const daemon = proxy.getInterface('org.freedesktop.DBus') as unknown as { NameHasOwner(name: string): Promise<boolean> }
    return await bounded(daemon.NameHasOwner('org.kde.StatusNotifierWatcher') as Promise<boolean>, 5000)
  } catch {
    return false
  } finally {
    bus?.disconnect()
  }
}

export class LinuxNotifications {
  private bus: dbus.MessageBus | null = null
  private remote: NotificationInterface | null = null
  private connecting: Promise<void> | null = null
  private generation = 0
  private handles = new NotificationHandles()
  onAction: (id: number, action: string) => void = () => {}
  onClosed: (id: number, reason: number) => void = () => {}
  onRestart: () => void = () => {}

  constructor(private icon: string, private log: (message: string, error?: unknown) => void) {}

  /** Refuse enable when actions are unsupported rather than offering a reduced notification surface. */
  async connect(): Promise<void> {
    if (this.remote) return
    if (this.connecting) return this.connecting
    this.connecting = bounded(this.connectRemote(), 10_000)
    try {
      await this.connecting
    } catch (error) {
      this.dispose()
      throw error
    } finally {
      this.connecting = null
    }
  }

  private async connectRemote(): Promise<void> {
    const generation = this.generation
    if (!this.bus) {
      const bus = dbus.sessionBus()
      this.bus = bus
      bus.on('error', (error: unknown) => {
        if (this.bus !== bus) return
        this.log('Session D-Bus failed', error)
        this.remote = null
        this.generation++
        this.handles.retire()
        if (this.bus === bus) this.bus = null
        bus.disconnect()
        this.onRestart()
      })
      const proxy = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
      const daemon = proxy.getInterface('org.freedesktop.DBus')
      daemon.on('NameOwnerChanged', (name: string) => {
        if (this.bus !== bus || name !== 'org.freedesktop.Notifications') return
        this.remote = null
        this.generation++
        for (const publication of this.handles.retire()) {
          void this.closeOwner(publication.owner, publication.nativeId, true)
        }
        this.onRestart()
      })
    }
    const bus = this.bus
    if (!bus || generation !== this.generation) throw new Error('Notification connection was cancelled')
    const control = (await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')).getInterface('org.freedesktop.DBus') as unknown as { GetNameOwner(name: string): Promise<string> }
    const owner = await control.GetNameOwner('org.freedesktop.Notifications')
    const proxy = await bus.getProxyObject(owner, '/org/freedesktop/Notifications')
    const remote = proxy.getInterface('org.freedesktop.Notifications') as unknown as NotificationInterface
    const capabilities = await remote.GetCapabilities()
    if (!capabilities.includes('actions')) throw new Error('The Linux notification service does not support actions')
    if (generation !== this.generation || this.bus !== bus) throw new Error('Notification service restarted during connection')
    remote.on('ActionInvoked', (id: number, action: string) => {
      const handle = this.handles.find(remote, id)
      if (generation === this.generation && handle) this.onAction(handle, action)
    })
    remote.on('NotificationClosed', (id: number, reason: number) => {
      const handle = this.handles.find(remote, id)
      if (generation === this.generation && handle) { this.handles.take(handle); this.onClosed(handle, reason) }
    })
    this.remote = remote
  }

  /** Replace one occurrence. Sound on restoration is suppressed; configured nags explicitly re-alert. */
  async show(alarm: PresentedAlarm, replaceId: number, confirming: boolean, audible: boolean): Promise<number> {
    await this.connect()
    const remote = this.remote
    const generation = this.generation
    if (!remote) throw new Error('Notification service changed before publication')
    const actions = confirming
      ? ['default', 'Open reminder', 'cancel', 'Not yet', 'confirm', 'Confirm done']
      : ['default', 'Open reminder', 'snooze', 'Snooze', 'done', 'Done', ...(alarm.canSilence ? ['silence', 'De-escalate'] : [])]
    const publication = remote.Notify('Persistent', this.handles.replacement(replaceId, remote), this.icon, alarm.title,
      confirming ? 'Mark this done?' : escapeBody(alarm.body), actions, {
        'desktop-entry': new dbus.Variant('s', 'ca.persistent.desktop'),
        'resident': new dbus.Variant('b', true),
        'transient': new dbus.Variant('b', false),
        'urgency': new dbus.Variant('y', 2),
        'suppress-sound': new dbus.Variant('b', alarm.alarm || !audible),
        ...(audible && !alarm.alarm ? { 'sound-name': new dbus.Variant('s', 'message-new-instant') } : {})
      }, 0)
    const id = await bounded(publication, 20_000, (lateId) => {
      if (!this.handles.find(remote, lateId)) void this.closeOwner(remote, lateId, generation !== this.generation)
    })
    if (generation !== this.generation || this.remote !== remote) {
      await this.closeOwner(remote, id, true)
      throw new Error('Notification service restarted during publication')
    }
    return this.handles.register(remote, id)
  }

  /** Closing zero (no publication) or a dead daemon is a no-op, never a restoration request. */
  async close(id: number): Promise<void> {
    const publication = this.handles.take(id)
    if (!publication) return
    await this.closeOwner(publication.owner, publication.nativeId)
  }

  /** Only known departed-owner errors are benign; other cleanup failures remain observable. */
  private async closeOwner(owner: NotificationOwner, id: number, departed = false): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) return
    try { await bounded(owner.CloseNotification(id), 5000) }
    catch (error) {
      const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : null
      if (departed && ['org.freedesktop.DBus.Error.ServiceUnknown', 'org.freedesktop.DBus.Error.NameHasNoOwner'].includes(type as string)) return
      this.log('Could not remove a Linux notification', error)
    }
  }

  dispose(): void {
    this.generation++
    this.remote = null
    this.handles.retire()
    this.bus?.disconnect()
    this.bus = null
  }
}
