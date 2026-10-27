/**
 * Runtime-detected transport for Windows WebView2 and the sandboxed Linux host.
 * Native hosts consume server alarm projections; this channel owns bounded UI
 * navigation, appearance and machine preferences, plus Windows widget snapshots.
 * Android keeps its separate Capacitor alarm bridge.
 */

import type {
  NativeLocale,
  DesktopWindowSize as FlyoutSizeOption,
  DesktopSnoozeChoice as SnoozeChoiceOption,
  DesktopHostSettings as HostSettings,
  DesktopHostSettingsPatch as HostSettingsPatch
} from '@persistent/shared'

interface WebView2Bridge {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

declare global {
  interface Window {
    chrome?: { webview?: WebView2Bridge }
    /** Sandboxed Linux host; exposes the same bounded message channel as WebView2. */
    persistentDesktop?: WebView2Bridge & { platform: 'linux' }
  }
}

/**
 * Messages the host sends us. Anything unrecognised is ignored.
 *
 * `navigate` carries an in-app path, not a URL: it comes from clicking a Windows
 * toast, and the host deliberately does not navigate the WebView itself. Doing so
 * would reload the app and throw away where the user was — the same reason `back`
 * is a message rather than `CoreWebView2.GoBack()`.
 *
 * `checkForUpdate` says the flyout was just reopened, so this page may have been
 * frozen for days (`lib/swUpdate.ts`). It is a nudge, not an instruction: the page
 * decides whether to act, exactly as it does for `back`.
 *
 * `hostSettings` is the host's own settings, which this page's Settings screen
 * shows instead of the tray app keeping a second one (`DesktopSettings.tsx`). It
 * arrives in reply to `getHostSettings`, after every write, and whenever the host
 * changes one itself.
 */
type HostMessage =
  | { type: 'back' }
  | { type: 'navigate'; path: string }
  | { type: 'checkForUpdate' }
  | { type: 'refreshWidgetSnapshot' }
  | { type: 'snoozeOccurrence'; occurrenceId: string }
  | { type: 'hostSettings'; settings: HostSettings }

export interface WidgetReminderItem {
  type: string
  title: string
  description: string
  when: string
  paused: boolean
}

export interface WidgetSnapshot {
  version: 1
  signedIn: boolean
  generatedAt: string
  items: WidgetReminderItem[]
}

// Preserve this module's existing public names while keeping native/web payload
// shapes in the shared package. The hosts, not the page, own these preferences.
export type {
  DesktopWindowSize as FlyoutSizeOption,
  DesktopSnoozeChoice as SnoozeChoiceOption,
  DesktopHostSettings as HostSettings,
  DesktopHostSettingsPatch as HostSettingsPatch
} from '@persistent/shared'

function isFlyoutSizeOption(value: unknown): value is FlyoutSizeOption {
  if (typeof value !== 'object' || value === null) return false
  const option = value as Record<string, unknown>
  return (
    typeof option.id === 'string' &&
    typeof option.label === 'string' &&
    typeof option.width === 'number' &&
    typeof option.height === 'number'
  )
}

function isSnoozeChoiceOption(value: unknown): value is SnoozeChoiceOption {
  if (typeof value !== 'object' || value === null) return false
  const option = value as Record<string, unknown>
  return typeof option.minutes === 'number' && typeof option.label === 'string'
}

/** Keep the first of each id/minutes, so a duplicate can't collide as a React key. */
function distinctBy<T>(options: T[], key: (option: T) => string | number): T[] {
  const seen = new Set<string | number>()
  return options.filter((option) => {
    const id = key(option)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/**
 * Validate a `hostSettings` payload, returning null for anything that isn't a
 * complete one. Placement and the live device clock are optional on older hosts.
 *
 * Existing fields are required so controls never show values the host does not
 * use. Newly added placement is optional: older hosts retain their other
 * controls, and the placement picker stays hidden until a supporting host replies.
 * Invalid optional clock metadata is ignored without hiding working host controls.
 */
export function parseHostSettings(value: unknown): HostSettings | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const sizes = Array.isArray(raw.flyoutSizes)
    ? distinctBy(raw.flyoutSizes.filter(isFlyoutSizeOption), (size) => size.id)
    : []
  const snoozes = Array.isArray(raw.snoozeChoices)
    ? distinctBy(raw.snoozeChoices.filter(isSnoozeChoiceOption), (choice) => choice.minutes)
    : []
  if (
    (raw.platform !== undefined && !['windows', 'linux'].includes(raw.platform as string)) ||
    (raw.snoozeInApp !== undefined && typeof raw.snoozeInApp !== 'boolean') ||
    typeof raw.notifications !== 'boolean' ||
    typeof raw.snoozeMinutes !== 'number' ||
    typeof raw.pinFlyout !== 'boolean' ||
    typeof raw.startAtSignIn !== 'boolean' ||
    typeof raw.flyoutSize !== 'string' ||
    (raw.flyoutPlacement !== undefined && !['tray', 'last', 'center'].includes(raw.flyoutPlacement as string)) ||
    sizes.length === 0 ||
    snoozes.length === 0
  ) {
    return null
  }
  // Snapped to something on offer rather than rejected. An out-of-list value is a
  // different failure from a missing field: the payload is intelligible, and
  // hiding the whole section over it would cost the user four working controls.
  // A picker whose value matches no option renders blank, which is the one
  // outcome worth ruling out here.
  return {
    ...(raw.deviceTimeFormat === '12h' || raw.deviceTimeFormat === '24h'
      ? { deviceTimeFormat: raw.deviceTimeFormat }
      : {}),
    ...(raw.platform === undefined ? {} : { platform: raw.platform as HostSettings['platform'] }),
    ...(raw.snoozeInApp === undefined ? {} : { snoozeInApp: raw.snoozeInApp as boolean }),
    notifications: raw.notifications,
    snoozeMinutes: nearest(snoozes, raw.snoozeMinutes),
    snoozeChoices: snoozes,
    pinFlyout: raw.pinFlyout,
    startAtSignIn: raw.startAtSignIn,
    flyoutSize: sizes.some((size) => size.id === raw.flyoutSize) ? raw.flyoutSize : sizes[0]!.id,
    flyoutSizes: sizes,
    ...(raw.flyoutPlacement === undefined
      ? {}
      : { flyoutPlacement: raw.flyoutPlacement as HostSettings['flyoutPlacement'] })
  }
}

/** The offered duration closest to `minutes`, mirroring `ToastNotifier.NearestOffered`. */
function nearest(choices: SnoozeChoiceOption[], minutes: number): number {
  return choices.reduce((best, choice) =>
    Math.abs(choice.minutes - minutes) < Math.abs(best.minutes - minutes) ? choice : best
  ).minutes
}

/** Select the host's bounded transport at runtime; browsers and Capacitor have neither. */
function desktopTransport(): WebView2Bridge | undefined {
  if (typeof window === 'undefined') return undefined
  return window.persistentDesktop ?? window.chrome?.webview
}

/** True inside either native desktop host. Keep separate from Capacitor detection. */
export function isDesktopHost(): boolean {
  return typeof desktopTransport()?.postMessage === 'function'
}

/** Read immutable host identity, retaining Windows as the answer for existing WebView2 builds. */
export function desktopPlatform(): 'windows' | 'linux' | null {
  if (!isDesktopHost()) return null
  return window.persistentDesktop?.platform === 'linux' ? 'linux' : 'windows'
}

/**
 * Subscribe to messages from the host. Returns an unsubscribe function; a no-op
 * on every other host.
 *
 * Every subscriber picks out the messages it cares about and ignores the rest, so
 * `back` and `navigate` are read by `useNativeBack.ts`, `checkForUpdate` by
 * `lib/swUpdate.ts`, and `hostSettings` by `useHostSettings.ts`. In each case the
 * host says what happened and the page decides what it means: the hierarchy that
 * Back walks is a web concern, and so is what a route does.
 *
 * `path` is validated here rather than trusted: it must be a root-relative,
 * single-slash path. A host message is not a privileged caller either, and letting
 * `//evil.example` or a full URL through would turn this into an open redirect
 * driven by whatever was in a notification.
 */
export function onHostMessage(handler: (message: HostMessage) => void): () => void {
  if (!isDesktopHost()) return () => {}
  const bridge = desktopTransport()!
  const listener = (event: { data: unknown }) => {
    const data = event.data
    if (typeof data !== 'object' || data === null) return
    const type = (data as { type?: unknown }).type
    if (type === 'back') handler({ type: 'back' })
    if (type === 'checkForUpdate') handler({ type: 'checkForUpdate' })
    if (type === 'refreshWidgetSnapshot') handler({ type: 'refreshWidgetSnapshot' })
    if (type === 'navigate') {
      const path = (data as { path?: unknown }).path
      if (typeof path === 'string') {
        const hasUnsafeCharacter = Array.from(path).some((character) =>
          character === '\\' || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
        if (path.startsWith('/') && !path.startsWith('//') && !hasUnsafeCharacter) {
          handler({ type: 'navigate', path })
        }
      }
    }
    if (type === 'snoozeOccurrence') {
      const id = (data as { occurrenceId?: unknown }).occurrenceId
      if (typeof id === 'string' && id.length > 0 && id.length <= 512) handler({ type: 'snoozeOccurrence', occurrenceId: id })
    }
    if (type === 'hostSettings') {
      const settings = parseHostSettings((data as { settings?: unknown }).settings)
      if (settings) handler({ type: 'hostSettings', settings })
    }
  }
  bridge.addEventListener('message', listener)
  return () => bridge.removeEventListener('message', listener)
}

/** Post to the host, or do nothing anywhere else. */
function postToHost(message: unknown): void {
  if (!isDesktopHost()) return
  try {
    desktopTransport()!.postMessage(message)
  } catch {
    // Every caller is a request the host may simply not answer, and each one
    // already copes with silence.
  }
}

/**
 * Ask the host to close the flyout — the desktop equivalent of Android's Back
 * leaving the app, used when a Back press has nowhere left to go.
 */
export function requestClose(): void {
  // Worst case the flyout stays open; the user can click away from it.
  postToHost({ type: 'close' })
}

/**
 * Tell the host this page is listening for its messages.
 *
 * Posted once the `onHostMessage` subscription is attached, which is the only
 * moment a `navigate` can actually be acted on. The host builds the WebView at
 * startup and holds a toast click or an "Open Persistent settings" until it hears
 * this, rather than posting into a page that has not mounted and losing it.
 */
export function announcePageReady(): void {
  postToHost({ type: 'pageReady' })
}

/**
 * Give the native widget a small, already-formatted view of Upcoming. The host
 * validates and stores it locally; it never receives authentication material or
 * enough domain state to reproduce reminder scheduling.
 */
export function publishWidgetSnapshot(snapshot: WidgetSnapshot): void {
  postToHost({ type: 'widgetSnapshot', snapshot })
}

/** Remove personal widget content as soon as this desktop WebView signs out. */
export function clearWidgetSnapshot(): void {
  publishWidgetSnapshot({
    version: 1,
    signedIn: false,
    generatedAt: new Date().toISOString(),
    items: []
  })
}

/** Clear native desktop notifications before the departing session is removed. */
export function notifyHostSignedOut(): void {
  postToHost({ type: 'signedOut' })
}

/** Resume Linux delivery after server-confirmed sign-in and prior-account alert cleanup. */
export function notifyHostSignedIn(): void {
  if (desktopPlatform() === 'linux') postToHost({ type: 'signedIn' })
}

/**
 * Ask the host for its settings. It replies with a `hostSettings` message, and a
 * host too old to know the request simply never does, which is the whole version
 * check, since the page is a hosted bundle that updates on its own while the .exe
 * may be an older portable build or a pending Store update.
 */
export function requestHostSettings(): void {
  postToHost({ type: 'getHostSettings' })
}

/**
 * Change one or more host settings. The host validates, applies what it can, and
 * posts back the settings it actually holds, so a refused change corrects itself
 * rather than leaving the page showing something untrue.
 */
export function writeHostSettings(patch: HostSettingsPatch): void {
  postToHost({ type: 'setHostSettings', settings: patch })
}

/**
 * Open the host's own settings window, which keeps what cannot live in here: the
 * server address (a control for the setting that decides whether this page loads
 * is no use inside the page), the app version and update check, the log folder,
 * and the theme of that window itself, which this page cannot see.
 */
export function openHostSettingsWindow(): void {
  postToHost({ type: 'openHostSettings' })
}

/** Announce the authenticated picker listener, separately from the top-level routing listener. */
export function announceNotificationActions(ready: boolean): void {
  postToHost({ type: ready ? 'notificationActionsReady' : 'notificationActionsGone' })
}

/** Mirror page colors through either desktop transport without exposing implementation-specific APIs. */
export function publishDesktopAppearance(mode: 'light' | 'dark', background: string): void {
  postToHost({ type: 'appearance', mode, background })
}

/** Display-only additive bridge message; older hosts safely ignore it. */
export function publishDesktopLocale(locale: NativeLocale): void {
  postToHost({ type: 'locale', locale })
}
