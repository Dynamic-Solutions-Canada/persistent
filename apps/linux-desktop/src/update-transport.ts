/** Anonymous release transport follows only GitHub's known asset redirects. */
import { LINUX_RELEASE_REPOSITORY } from '@persistent/shared'
import type { UpdateFetch } from './release-check.js'

/** Restrict every hop; release metadata cannot redirect executable downloads to arbitrary hosts. */
export function trustedUpdateUrl(value: string): boolean {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  if (url.hostname === 'api.github.com') return url.pathname === `/repos/${LINUX_RELEASE_REPOSITORY}/releases`
  if (url.hostname === 'github.com') return url.pathname.startsWith(`/${LINUX_RELEASE_REPOSITORY}/releases/download/linux-v`)
  return ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)
}

/** A single caller-owned deadline covers response headers, redirects and body streaming. */
export async function releaseResponse(url: string, fetcher: UpdateFetch, signal: AbortSignal): Promise<Response> {
  for (let hop = 0; hop < 6; hop++) {
    if (!trustedUpdateUrl(url)) throw new Error('The update destination is not trusted.')
    const response = await fetcher(url, {
      headers: { Accept: 'application/json, application/octet-stream', 'User-Agent': 'Persistent-Linux' },
      credentials: 'omit', signal, redirect: 'manual'
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location) throw new Error('The update redirect has no destination.')
    url = new URL(location, url).href
  }
  throw new Error('Too many update redirects.')
}
