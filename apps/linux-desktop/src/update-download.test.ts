/** Release downloads cannot escape trusted transport or install unchecked cached bytes. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadUpdate, verifyUpdateFile } from './update-download.js'
import { releaseResponse, trustedUpdateUrl } from './update-transport.js'
import { assertDebianIdentity } from './update-install.js'
import { replaceImage } from '../scripts/install.js'
import type { LinuxUpdate } from './release-check.js'

const bytes = Buffer.alloc(64, 3)
const update: LinuxUpdate = { version: '0.2.0', tag: 'linux-v0.2.0', url: 'https://github.com/RyanEwen/persistent/releases/tag/linux-v0.2.0',
  downloadUrl: 'https://github.com/RyanEwen/persistent/releases/download/linux-v0.2.0/Persistent-Linux-0.2.0-x86_64.AppImage',
  artifact: { name: 'Persistent-Linux-0.2.0-x86_64.AppImage', architecture: 'x64', kind: 'AppImage', size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') } }

test('release transport omits credentials and refuses an arbitrary redirect before fetching it', async () => {
  const visited: string[] = []
  await assert.rejects(releaseResponse(update.downloadUrl, async (url, init) => {
    visited.push(url); assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'manual')
    return new Response(null, { status: 302, headers: { location: 'https://evil.example/package' } })
  }, new AbortController().signal), /not trusted/)
  assert.deepEqual(visited, [update.downloadUrl])
  assert.equal(trustedUpdateUrl('https://github.com/Other/repo/releases/download/linux-v0.2.0/file'), false)
  assert.equal(trustedUpdateUrl('http://release-assets.githubusercontent.com/file'), false)
  assert.equal(trustedUpdateUrl('https://user:pass@github.com/RyanEwen/persistent/releases/download/linux-v0.2.0/file'), false)
})

test('verified downloads reuse matching cache and replace corrupted cache only after verification', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'persistent-update-download-'))
  let downloads = 0
  const fetcher = async () => { downloads++; return new Response(bytes) }
  try {
    const file = await downloadUpdate(update, directory, fetcher, new AbortController().signal, () => {})
    await verifyUpdateFile(file, update)
    await downloadUpdate(update, directory, fetcher, new AbortController().signal, () => {})
    assert.equal(downloads, 1)
    await writeFile(file, Buffer.alloc(64, 9))
    await downloadUpdate(update, directory, fetcher, new AbortController().signal, () => {})
    assert.equal(downloads, 2)
    assert.deepEqual(await readFile(file), bytes)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('truncation, oversized downloads and checksum mismatch remove staging without publishing', async () => {
  for (const wrong of [Buffer.alloc(63), Buffer.alloc(65), Buffer.alloc(64, 2)]) {
    const directory = await mkdtemp(join(tmpdir(), 'persistent-update-rejected-'))
    try {
      await assert.rejects(downloadUpdate(update, directory, async () => new Response(wrong), new AbortController().signal, () => {}))
      assert.deepEqual(await readdir(directory), [])
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
})

test('failed atomic replacement preserves the installed executable and removes private staging', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'persistent-update-atomic-'))
  try {
    const source = join(directory, 'download'); const destination = join(directory, 'installed')
    await writeFile(source, 'new'); await writeFile(destination, 'old')
    await assert.rejects(replaceImage(source, destination, async () => { throw new Error('CPU mismatch') }), /CPU mismatch/)
    assert.equal(await readFile(destination, 'utf8'), 'old')
    assert.deepEqual((await readdir(directory)).sort(), ['download', 'installed'])
    await replaceImage(source, destination)
    assert.equal(await readFile(destination, 'utf8'), 'new')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('Debian installation refuses another package, wrong version and wrong CPU', () => {
  assertDebianIdentity('persistent\n0.2.0\namd64\n', '0.2.0', 'x64')
  for (const bad of ['other\n0.2.0\namd64', 'persistent\n0.1.0\namd64', 'persistent\n0.2.0\narm64']) {
    assert.throws(() => assertDebianIdentity(bad, '0.2.0', 'x64'))
  }
})
