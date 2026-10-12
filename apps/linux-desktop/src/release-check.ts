/** Linux-only discovery pins release metadata and payloads to this repository's stable channel. */
import { releaseResponse } from './update-transport.js'
import { linuxUpdateManifestSchema, linuxVersionSchema, type LinuxUpdateArtifact } from '@persistent/shared'

export interface LinuxRelease { version: string; url: string; tag: string }
export interface LinuxUpdate extends LinuxRelease { artifact: LinuxUpdateArtifact; downloadUrl: string }
export type UpdateFetch = (input: string, init?: RequestInit) => Promise<Response>
const RELEASE_ROOT = 'https://github.com/RyanEwen/persistent/releases'

/** Choose the newest canonical Linux tag, independently of Android's GitHub Latest release. */
export function linuxRelease(value: unknown, architecture: string): LinuxRelease | null {
  if (!Array.isArray(value)) throw new Error('Invalid release response')
  if (architecture !== 'arm64' && architecture !== 'x64') return null
  let latest: LinuxRelease | null = null
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const release = candidate as Record<string, unknown>
    if (release.draft !== false || release.prerelease !== false || !Array.isArray(release.assets)) continue
    if (typeof release.tag_name !== 'string' || !release.tag_name.startsWith('linux-v')) continue
    const version = release.tag_name.slice(7)
    if (!linuxVersionSchema.safeParse(version).success) continue
    const url = `${RELEASE_ROOT}/tag/${release.tag_name}`
    if (release.html_url !== url) continue
    const cpu = architecture === 'x64' ? 'x86_64' : 'arm64'
    if (!release.assets.some((asset) => typeof asset === 'object' && asset !== null &&
      'name' in asset && asset.name === `Persistent-Linux-${version}-${cpu}.AppImage`)) continue
    if (!latest || newerVersion(version, latest.version)) latest = { version, url, tag: release.tag_name }
  }
  return latest
}

/** Numeric, canonical versions prevent downgrades and overflow-based false comparisons. */
export function newerVersion(latest: string, current: string): boolean {
  const next = linuxVersionSchema.parse(latest).split('.').map(Number)
  const installed = linuxVersionSchema.parse(current).split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index]! > installed[index]!
  }
  return false
}

/** Public metadata requests never carry the hosted app's authenticated cookies. */
async function publicJson(url: string, fetcher: UpdateFetch): Promise<unknown> {
  const response = await releaseResponse(url, fetcher, AbortSignal.timeout(15_000))
  if (!response.ok) throw new Error(`Update metadata request failed (HTTP ${response.status}).`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Update metadata response is empty.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 1024 * 1024) throw new Error('Update metadata response is too large.')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

/** Resolve a checksum-bearing artifact of the current installation type and CPU. */
export async function findLinuxUpdate(version: string, architecture: string, kind: 'AppImage' | 'deb', fetcher: UpdateFetch): Promise<LinuxUpdate | null> {
  const releases: unknown[] = []
  for (let page = 1; page <= 5; page++) {
    const batch = await publicJson(`https://api.github.com/repos/RyanEwen/persistent/releases?per_page=100&page=${page}`, fetcher)
    if (!Array.isArray(batch)) throw new Error('Invalid release response')
    releases.push(...batch)
    if (batch.length < 100) break
    if (page === 5) throw new Error('The Linux release channel could not be fully checked. Try again later.')
  }
  const release = linuxRelease(releases, architecture)
  if (!release || !newerVersion(release.version, version)) return null
  const base = `${RELEASE_ROOT}/download/${release.tag}/`
  const manifest = linuxUpdateManifestSchema.parse(await publicJson(`${base}Persistent-Linux-${release.version}-update.json`, fetcher))
  if (manifest.version !== release.version) throw new Error('Update metadata does not match its release.')
  const artifact = manifest.artifacts.find((entry) => entry.architecture === architecture && entry.kind === kind)
  if (!artifact) throw new Error('This release has no update for the installed package type.')
  return { ...release, artifact, downloadUrl: `${base}${artifact.name}` }
}
