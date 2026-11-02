/** Publishing requires both supported CPU images and never advertises obsolete package files. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { linuxUpdateManifestSchema } from '@persistent/shared'
import { releaseManifest } from './release-manifest.js'

test('release manifest requires x64 and ARM64 AppImages and ignores leftover Debian artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'persistent-release-'))
  try {
    const bytes = Buffer.from('synthetic release image')
    await writeFile(join(directory, 'Persistent-Linux-0.2.0-x86_64.AppImage'), bytes)
    await assert.rejects(releaseManifest(directory, '0.2.0'), /ENOENT/)
    await writeFile(join(directory, 'Persistent-Linux-0.2.0-arm64.AppImage'), bytes)
    await writeFile(join(directory, 'Persistent-Linux-0.2.0-amd64.deb'), 'obsolete')
    await releaseManifest(directory, '0.2.0')
    const manifest = linuxUpdateManifestSchema.parse(JSON.parse(await readFile(join(directory, 'Persistent-Linux-0.2.0-update.json'), 'utf8')))
    assert.deepEqual(manifest.artifacts.map((asset) => asset.architecture), ['x64', 'arm64'])
    for (const asset of manifest.artifacts) {
      assert.equal(asset.kind, 'AppImage')
      assert.equal(asset.sha512, createHash('sha512').update(bytes).digest('base64'))
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
