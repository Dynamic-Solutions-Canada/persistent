/** Bounded executable downloads remain quarantined until checksum, size and package identity pass. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, open, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { LinuxUpdate, UpdateFetch } from './release-check.js'
import { releaseResponse } from './update-transport.js'

/** Recheck a staged file before installation or cache reuse, including exact size. */
export async function verifyUpdateFile(file: string, update: LinuxUpdate, signal?: AbortSignal): Promise<void> {
  if ((await stat(file)).size !== update.artifact.size) throw new Error('The update package size does not match.')
  signal?.throwIfAborted()
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(file)) { signal?.throwIfAborted(); hash.update(chunk as Buffer) }
  if (hash.digest('base64') !== update.artifact.sha512) throw new Error('The update package checksum does not match.')
}

/** Atomically publish a verified cache file; failure/cancellation removes only its private staging directory. */
export async function downloadUpdate(update: LinuxUpdate, directory: string, fetcher: UpdateFetch, signal: AbortSignal, progress: (percent: number) => void): Promise<string> {
  signal.throwIfAborted()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const destination = join(directory, update.artifact.name)
  try {
    await verifyUpdateFile(destination, update, signal)
    return destination
  } catch (error) {
    signal.throwIfAborted()
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      // A mismatched cached file is never reused. The download below replaces it
      // only after independently verifying a new file; the installed app is untouched.
      progress(0)
    }
  }
  const temporary = await mkdtemp(join(directory, '.download-'))
  const pending = join(temporary, update.artifact.name)
  try {
    const response = await releaseResponse(update.downloadUrl, fetcher, AbortSignal.any([signal, AbortSignal.timeout(5 * 60_000)]))
    if (!response.ok || !response.body) throw new Error(`Update download failed (HTTP ${response.status}).`)
    const handle = await open(pending, 'wx', 0o600)
    const reader = response.body.getReader()
    let size = 0
    let lastProgress = -1
    try {
      for (;;) {
        signal.throwIfAborted()
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > update.artifact.size) throw new Error('The update download exceeded its declared size.')
        await handle.writeFile(value)
        const percent = Math.floor(size / update.artifact.size * 100)
        if (percent !== lastProgress) { lastProgress = percent; progress(percent) }
      }
      await handle.sync()
    } finally {
      try { await reader.cancel() }
      finally { await handle.close() }
    }
    signal.throwIfAborted()
    await verifyUpdateFile(pending, update, signal)
    await rename(pending, destination)
    return destination
  } finally { await rm(temporary, { recursive: true, force: true }) }
}
