/**
 * The Content-Security-Policy directives the API sends with every response (helmet's defaults
 * plus these). The page is locked to its own origin, with named exceptions:
 * - Google Identity Services (Sign in with Google) loads a script and an iframe and connects to
 *   accounts.google.com.
 * - The analytics tracker's origin, only when analytics is configured (`analyticsCspSources`).
 * - The "Our other apps" catalog: the web refreshes apps.json and loads newly added icons from
 *   the apps-promo repository on raw.githubusercontent.com. The source carries the repository
 *   path, so the rest of that host stays blocked.
 */

/** Where the promoted-apps catalog and its icons are served from (see promo's CATALOG_BASE_URL). */
export const PROMOTED_APPS_CSP_SOURCE =
  'https://raw.githubusercontent.com/Dynamic-Solutions-Canada/apps-promo/'

/**
 * The directives for helmet's `contentSecurityPolicy`.
 *
 * @param analyticsSources The tracker origin from `analyticsCspSources`, or an empty list.
 */
export function contentSecurityDirectives(
  analyticsSources: string[],
): Record<string, string[]> {
  return {
    'script-src': [
      "'self'",
      'https://accounts.google.com/gsi/client',
      ...analyticsSources,
    ],
    'connect-src': [
      "'self'",
      'https://accounts.google.com/gsi/',
      PROMOTED_APPS_CSP_SOURCE,
      ...analyticsSources,
    ],
    'frame-src': ["'self'", 'https://accounts.google.com/gsi/'],
    'img-src': [
      "'self'",
      'data:',
      'https://*.googleusercontent.com',
      PROMOTED_APPS_CSP_SOURCE,
    ],
  }
}
