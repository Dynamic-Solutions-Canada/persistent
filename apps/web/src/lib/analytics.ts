/**
 * Loads the self-hosted, cookieless Umami tracker in web browsers when the server has analytics
 * configured (GET /api/analytics-config; UMAMI_SCRIPT_URL and UMAMI_WEBSITE_ID on the server).
 * LOG-9 allows this browser-only visit counting (D-117); the privacy page describes it.
 *
 * It never loads inside a native host. The Android app (Capacitor), the Windows app (WebView2,
 * in every frame and popup) and the Linux app (Electron, including its bridge-less sign-in
 * popups) are each detected explicitly (`isNativeHostPage`).
 *
 * What reaches Umami is limited on purpose:
 * - Query strings and hashes are never sent (`data-exclude-search`, `data-exclude-hash`).
 * - Every event passes through `sanitizeTrackedPayload` (`data-before-send`): path segments that
 *   identify something (a reminder id, a long token) become `:id`, so `/reminders/<id>` is
 *   tracked as `/reminders/:id`; referrers lose their query string and hash; and the title is
 *   always the app name, so a reminder title can never be sent.
 * - Tracking runs only on the public host (`data-domains`) and honours Do Not Track.
 *
 * Umami calls `data-before-send` by the name of a function on `window`, so the sanitiser is
 * exposed under one namespaced property; nothing else is global.
 */
import {
  analyticsConfigResponseSchema,
  type ClientAnalyticsConfig,
} from '@persistent/shared'
import { apiFetch } from './apiClient.js'

/** The window property Umami calls before sending each event. */
const BEFORE_SEND_NAME = 'persistentAnalyticsBeforeSend'

/** The only page title that may be tracked: the app's own name. */
const APP_TITLE = 'Persistent'

/** A path segment that identifies one thing: a UUID, a cuid, a long number or a long token. */
const IDENTIFYING_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{20,}|\d{6,}|[A-Za-z0-9_-]{20,})$/i

/** The fields of an Umami event this app rewrites; the rest pass through unchanged. */
interface TrackedPayload {
  url?: string
  referrer?: string
  title?: string
  [key: string]: unknown
}

/** The browser globals the wrapper checks read, so tests can pass their own. */
export interface HostSignals {
  userAgent: string
  /** Capacitor's own answer: true inside the Android app. */
  capacitorNative: boolean
  /** WebView2 exposes `window.chrome.webview` in every frame of the Windows app. */
  hasWebView2: boolean
  /** The Linux app's preload exposes `window.persistentDesktop` in its main view. */
  hasLinuxBridge: boolean
}

/**
 * True inside any native host: the Android app, the Windows app or the Linux app. Each check
 * stands alone, so one host's detection never depends on another's.
 */
export function isNativeHostPage(signals: HostSignals): boolean {
  if (signals.capacitorNative) return true
  // Android System WebView marks its user agent "; wv)"; a backstop for the Capacitor check.
  if (/;\s*wv\)/.test(signals.userAgent)) return true
  if (signals.hasWebView2) return true
  if (signals.hasLinuxBridge) return true
  // Electron windows, including the Linux app's sign-in popups that carry no bridge.
  if (/\bElectron\//.test(signals.userAgent)) return true
  return false
}

/**
 * A URL or path reduced to what may be tracked: no query string or hash, and identifying path
 * segments replaced with `:id`. A full URL keeps its origin.
 */
export function sanitizeTrackedUrl(value: string): string {
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
  const parsed = new URL(value, 'https://placeholder.invalid')
  const path = parsed.pathname
    .split('/')
    .map((segment) => {
      let decoded = segment
      try {
        decoded = decodeURIComponent(segment)
      } catch {
        // A malformed escape is tracked as itself, still checked against the pattern.
      }
      return IDENTIFYING_SEGMENT.test(decoded) ? ':id' : segment
    })
    .join('/')
  return isAbsolute ? `${parsed.origin}${path}` : path
}

/** Umami's before-send hook: the event with its URL, referrer and title made safe. */
export function sanitizeTrackedPayload(
  _type: string,
  payload: TrackedPayload,
): TrackedPayload {
  return {
    ...payload,
    ...(typeof payload.url === 'string'
      ? { url: sanitizeTrackedUrl(payload.url) }
      : {}),
    ...(typeof payload.referrer === 'string' && payload.referrer
      ? { referrer: sanitizeTrackedUrl(payload.referrer) }
      : {}),
    ...(typeof payload.title === 'string' ? { title: APP_TITLE } : {}),
  }
}

/** The tracker's script element, with the privacy settings above. */
export function buildTrackerScript(
  config: ClientAnalyticsConfig,
  doc: Document = document,
): HTMLScriptElement {
  const script = doc.createElement('script')
  script.defer = true
  script.src = config.scriptUrl
  script.dataset.websiteId = config.websiteId
  script.dataset.domains = config.domains.join(',')
  script.dataset.excludeSearch = 'true'
  script.dataset.excludeHash = 'true'
  script.dataset.doNotTrack = 'true'
  script.dataset.beforeSend = BEFORE_SEND_NAME
  return script
}

/** The current page's host signals. */
function currentSignals(capacitorNative: boolean): HostSignals {
  const win = window as unknown as {
    chrome?: { webview?: unknown }
    persistentDesktop?: unknown
  }
  return {
    userAgent: navigator.userAgent,
    capacitorNative,
    hasWebView2: Boolean(win.chrome?.webview),
    hasLinuxBridge: Boolean(win.persistentDesktop),
  }
}

/**
 * Load the tracker in a browser when the server has analytics configured. Inside a native host,
 * or on any failure, it does nothing: analytics must never break the app.
 *
 * @param capacitorNative Capacitor's `isNativePlatform()` answer, passed in so this module does
 *   not import the native bridge.
 */
export async function startAnalytics(capacitorNative: boolean): Promise<void> {
  try {
    if (isNativeHostPage(currentSignals(capacitorNative))) return
    const body = analyticsConfigResponseSchema.parse(
      await apiFetch<unknown>('/api/analytics-config'),
    )
    if (!body.analytics) return
    Object.assign(window, { [BEFORE_SEND_NAME]: sanitizeTrackedPayload })
    document.head.append(buildTrackerScript(body.analytics))
  } catch {
    // Analytics is optional; the app works the same without it.
  }
}
