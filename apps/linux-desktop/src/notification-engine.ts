/** Session-bound presentation and two-step confirmation; eligibility remains the server's decision. */
import type { PresentedAlarm } from './projection.js'

export interface NotificationSurface {
  show(alarm: PresentedAlarm, replaceId: number, confirming: boolean, audible: boolean): Promise<number>
  close(id: number): Promise<void>
  audio(active: boolean): void
  open(reminderId: string, snoozeOccurrenceId?: string): void
  write(id: string, action: 'ack' | 'silence'): Promise<boolean>
  error(message: string): void
}
interface Tracked {
  alarm: PresentedAlarm
  notificationId: number
  confirming: boolean
  lastSoundAt: number
  restoreAt: number | null
}

export class NotificationEngine {
  private entries = new Map<string, Tracked>()
  private epoch = 0
  private queue: Promise<void> = Promise.resolve()
  private cleanup: Promise<void> = Promise.resolve()

  constructor(private surface: NotificationSurface, private now: () => number = Date.now) {}

  /** Serialize native writes so replace IDs and confirmation state cannot race. */
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const epoch = this.epoch
    this.queue = this.queue.then(async () => {
      if (epoch === this.epoch) await operation()
    }).catch(() => { this.updateAudio()
      this.surface.error('Linux notification delivery failed. Check the app log and notification service.') })
    return this.queue
  }

  /** Invalidate immediately on sign-out/disable; close any delayed publication when it finally returns. */
  reset(): Promise<void> {
    this.epoch++
    const previous = [...this.entries.values()]
    this.entries.clear()
    this.surface.audio(false)
    const closing = Promise.all(previous.map((entry) => this.surface.close(entry.notificationId)))
    this.cleanup = Promise.all([this.cleanup, closing]).then(() => {})
    return this.cleanup
  }

  /** Replace only changed presentation, remove absent occurrences, and keep unchanged ones quiet. */
  reconcile(alarms: Map<string, PresentedAlarm>): Promise<void> {
    return this.enqueue(async () => {
      const epoch = this.epoch
      for (const [id, entry] of this.entries) {
        if (!alarms.has(id)) {
          this.entries.delete(id)
          await this.surface.close(entry.notificationId)
        }
      }
      for (const [id, alarm] of alarms) {
        if (epoch !== this.epoch) return
        let entry = this.entries.get(id)
        if (!entry) {
          entry = { alarm, notificationId: 0, confirming: false, lastSoundAt: 0, restoreAt: null }
          this.entries.set(id, entry)
          await this.present(entry, true)
        } else if (JSON.stringify(entry.alarm) !== JSON.stringify(alarm)) {
          const becameAlarm = !entry.alarm.alarm && alarm.alarm
          entry.alarm = alarm
          await this.present(entry, becameAlarm)
        }
      }
      this.updateAudio()
    })
  }

  /** A cross-device dismiss invalidates queued snapshots through the client's generation fence. */
  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const entry = this.entries.get(id)
      if (!entry) return
      this.entries.delete(id)
      this.updateAudio()
      await this.surface.close(entry.notificationId)
    })
  }

  /** Dismissed/expired banners return after five seconds; intentional host removal never restores them. */
  closed(notificationId: number, reason: number): void {
    for (const entry of this.entries.values()) {
      if (entry.notificationId !== notificationId) continue
      entry.notificationId = 0
      if (reason !== 3) entry.restoreAt = this.now() + 5000
    }
  }

  /** Re-present dismissed notifications and repeat only the server-specified soft nag interval. */
  tick(): Promise<void> {
    return this.enqueue(async () => {
      const now = this.now()
      for (const entry of this.entries.values()) {
        const restore = entry.restoreAt !== null && now >= entry.restoreAt
        const nag = !entry.confirming && !entry.alarm.alarm && entry.alarm.soundIntervalSeconds > 0
          && now - entry.lastSoundAt >= entry.alarm.soundIntervalSeconds * 1000
        if (restore || nag || entry.notificationId === 0 && entry.restoreAt === null) await this.present(entry, nag)
      }
      this.updateAudio()
    })
  }

  /** Map only the current daemon ID to an occurrence; stale actions after logout are ignored. */
  action(notificationId: number, action: string): Promise<void> {
    return this.enqueue(async () => {
      const entry = [...this.entries.values()].find((candidate) => candidate.notificationId === notificationId)
      if (!entry) return
      if (action === 'default' || action === 'snooze') {
        this.surface.open(entry.alarm.reminderId, action === 'snooze' ? entry.alarm.occurrenceId : undefined)
        return
      }
      if (action === 'done' || action === 'cancel') {
        entry.confirming = action === 'done'
        await this.present(entry, false)
        return
      }
      const write = action === 'confirm' && entry.confirming ? 'ack'
        : action === 'silence' && entry.alarm.canSilence && !entry.confirming ? 'silence' : null
      if (!write) return
      const epoch = this.epoch
      const accepted = await this.surface.write(entry.alarm.occurrenceId, write)
      if (epoch !== this.epoch) return
      if (accepted && write === 'ack') {
        this.entries.delete(entry.alarm.occurrenceId)
        this.updateAudio()
        await this.surface.close(entry.notificationId)
      } else if (!accepted) {
        this.surface.error('The reminder action could not be confirmed. Open Persistent to check its current state.')
        await this.present(entry, false)
      }
      // Silence is refreshed from the server, never locally inferred into a soft reminder.
    })
  }

  /** A daemon restart invalidates all its IDs; the next monitor pass restores live presentation. */
  daemonRestarted(): void {
    for (const entry of this.entries.values()) {
      entry.notificationId = 0
      entry.restoreAt = this.now() + 5000
    }
  }

  private async present(entry: Tracked, audible: boolean): Promise<void> {
    const epoch = this.epoch
    const id = await this.surface.show(entry.alarm, entry.notificationId, entry.confirming, audible)
    if (epoch !== this.epoch || !this.entries.has(entry.alarm.occurrenceId)) {
      await this.surface.close(id)
      return
    }
    entry.notificationId = id
    entry.restoreAt = null
    if (audible || !entry.lastSoundAt) entry.lastSoundAt = this.now()
  }

  private updateAudio(): void {
    this.surface.audio([...this.entries.values()].some((entry) => entry.alarm.alarm))
  }
}
