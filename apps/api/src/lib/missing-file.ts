/**
 * The miss path of the web app fallback (DIST-12). A GET that matched no built file is normally a
 * client-side route and gets the app shell, but a path whose last segment has a file extension
 * (`/old-icon.png`, `/assets/gone-1a2b.js`) names a file that is not there. Sending `index.html`
 * with a 200 under a script or image URL hides a broken deploy and lets a cache keep HTML under
 * that URL, so such a request gets a 404 marked `no-store` instead.
 *
 * Same shape as game-is-up's `web-static.ts`. No app route may end in a dotted segment; keep it
 * that way, or the route would be treated as a missing file.
 */
import type { Response } from 'express'

/** A last path segment ending in a file extension, such as `icon.png`; `uuid.` does not count. */
const fileExtension = /\.[A-Za-z0-9]+$/

/**
 * True when a path that matched no file names a file rather than a client-side route: its last
 * segment has a file extension.
 */
export function looksLikeFilePath(urlPath: string): boolean {
  const lastSegment = urlPath.split('/').at(-1) ?? ''
  return fileExtension.test(lastSegment)
}

/** Answer a request for a missing file: an empty 404 that no browser or CDN keeps. */
export function sendMissingFile(response: Response): void {
  response.setHeader('Cache-Control', 'no-store')
  response.status(404).end()
}
