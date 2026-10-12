/** Desktop-owned machine preferences shared by the hosted settings UI and native hosts. */
export interface DesktopWindowSize {
  id: string
  label: string
  width: number
  height: number
}

/** Windows offers a bounded native picker; Linux uses the full web picker instead. */
export interface DesktopSnoozeChoice {
  minutes: number
  label: string
}

/** Hosts own persistence and echo actual state. Optional capabilities preserve older Windows builds. */
export interface DesktopHostSettings {
  platform?: 'windows' | 'linux'
  snoozeInApp?: boolean
  notifications: boolean
  snoozeMinutes: number
  snoozeChoices: DesktopSnoozeChoice[]
  pinFlyout: boolean
  startAtSignIn: boolean
  flyoutSize: string
  flyoutSizes: DesktopWindowSize[]
  flyoutPlacement?: 'tray' | 'last' | 'center'
}

/** Capability/option metadata is read-only; only machine preferences can be requested by the page. */
export type DesktopHostSettingsPatch = Partial<Omit<DesktopHostSettings, 'platform' | 'snoozeInApp' | 'flyoutSizes' | 'snoozeChoices'>>
