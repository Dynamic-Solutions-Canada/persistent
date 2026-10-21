import { nativeText } from './localization.js'
/** Translate validated machine settings into the existing capability-detected hosted Settings screen. */
import type { DesktopHostSettings } from '@persistent/shared'
import { WINDOW_SIZES, validatedSettings, type Autostart, type SettingsStore } from './settings.js'
import type { HostedWindow } from './hosted-window.js'

export class HostSettings {
  constructor(private store: SettingsStore, private startup: Autostart, private hosted: HostedWindow, private enableNotifications: (enabled: boolean) => Promise<boolean>, private log: (message: string, error?: unknown) => void) {}

  send(): void {
    const current = this.store.current
    this.hosted.syncChrome()
    const preset = WINDOW_SIZES.find((option) => option.width === current.width && option.height === current.height)
    const settings: DesktopHostSettings = {
      platform: 'linux', snoozeInApp: true,
      notifications: current.notifications, pinFlyout: current.pinFlyout, startAtSignIn: this.startup.enabled(),
      // Required legacy fields keep older hosted bundles compatible; Linux hides the default-duration control.
      snoozeMinutes: 15, snoozeChoices: [{ minutes: 15, label: nativeText('15 min') }],
      flyoutSize: preset?.id ?? 'custom',
      flyoutSizes: (preset ? WINDOW_SIZES : [...WINDOW_SIZES, { id: 'custom', label: 'Custom', width: current.width, height: current.height }]).map(option => ({ ...option, label: nativeText(option.label) })),
      ...(!this.hosted.wayland ? { flyoutPlacement: current.placement } : {})
    }
    this.hosted.send({ type: 'hostSettings', settings })
  }

  /** The echo always describes actual host state, including a failed daemon/startup registration. */
  async apply(value: unknown): Promise<void> {
    if (typeof value !== 'object' || value === null) return
    const raw = value as Record<string, unknown>
    const previousNotifications = this.store.current.notifications
    try {
      const notifications = typeof raw.notifications === 'boolean' ? await this.enableNotifications(raw.notifications) : undefined
      if (typeof raw.startAtSignIn === 'boolean') this.startup.set(raw.startAtSignIn)
      const size = WINDOW_SIZES.find((option) => option.id === raw.flyoutSize)
      // Native theme/update preferences may change while daemon registration awaits.
      let next = validatedSettings({ pinFlyout: raw.pinFlyout }, this.store.current)
      if (notifications !== undefined) next.notifications = notifications
      if (size) { next = { ...next, width: size.width, height: size.height } }
      if (!this.hosted.wayland && ['tray', 'last', 'center'].includes(raw.flyoutPlacement as string)) next.placement = raw.flyoutPlacement as typeof next.placement
      this.store.save(next)
      if (size) this.hosted.window.setContentSize(size.width, size.height)
    } catch (error) {
      this.log('Host settings could not be applied', error)
      // A failed settings save must not leave delivery enabled behind an off toggle.
      await this.enableNotifications(previousNotifications)
    } finally {
      this.send()
    }
  }
}
