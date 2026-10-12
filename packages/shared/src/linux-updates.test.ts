import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linuxUpdateManifestSchema } from './linux-updates.js'

const asset = { architecture: 'x64', kind: 'AppImage', name: 'Persistent-Linux-0.2.0-x86_64.AppImage', size: 64, sha512: 'A'.repeat(86) + '==' }
const manifest = { format: 1, version: '0.2.0', artifacts: [asset] }

test('release metadata rejects traversal, duplicate artifacts, CPU/version mismatch and unbounded data', () => {
  assert.equal(linuxUpdateManifestSchema.safeParse(manifest).success, true)
  for (const artifacts of [[{ ...asset, name: '../app' }], [asset, asset], [{ ...asset, architecture: 'arm64' }],
    [{ ...asset, name: 'Persistent-Linux-0.1.0-x86_64.AppImage' }], [{ ...asset, size: 1024 ** 3 }], [{ ...asset, sha512: 'invalid' }]]) {
    assert.equal(linuxUpdateManifestSchema.safeParse({ ...manifest, artifacts }).success, false)
  }
})
