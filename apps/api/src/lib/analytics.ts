/**
 * Web analytics: the self-hosted, cookieless Umami on analytics.dynamic-solutions.ca, counting
 * visits in web browsers only (LOG-9, D-117).
 *
 * Analytics is on only when both UMAMI_SCRIPT_URL and UMAMI_WEBSITE_ID are set. Then the web app
 * gets the tracker's settings from GET /api/analytics-config, and the Content Security Policy
 * allows the tracker's origin for its script and its event requests; otherwise neither appears.
 * Tracking is limited to the public host (the first CLIENT_ORIGIN), so a local or staging build
 * never reports, and the web app strips identifiers from every tracked URL and never loads the
 * tracker inside a native host (`apps/web/src/lib/analytics.ts`).
 */
import type { ClientAnalyticsConfig } from '@persistent/shared'

/** The settings this module reads, so tests can pass their own. */
export interface AnalyticsEnvironment {
  /** The public origins, as configured (comma-separated); the first is the public host. */
  CLIENT_ORIGIN: string
  UMAMI_SCRIPT_URL?: string
  UMAMI_WEBSITE_ID?: string
}

/** The tracker settings for the web app, or null when analytics is off. */
export function getClientAnalyticsConfig(
  environment: AnalyticsEnvironment,
): ClientAnalyticsConfig | null {
  if (!environment.UMAMI_SCRIPT_URL || !environment.UMAMI_WEBSITE_ID) {
    return null
  }
  const publicOrigin = environment.CLIENT_ORIGIN.split(',')[0]?.trim()
  if (!publicOrigin) return null

  return {
    scriptUrl: environment.UMAMI_SCRIPT_URL,
    websiteId: environment.UMAMI_WEBSITE_ID,
    domains: [new URL(publicOrigin).hostname],
  }
}

/** The origin the CSP must allow for the tracker, or an empty list when analytics is off. */
export function analyticsCspSources(
  environment: AnalyticsEnvironment,
): string[] {
  const config = getClientAnalyticsConfig(environment)
  return config ? [new URL(config.scriptUrl).origin] : []
}
