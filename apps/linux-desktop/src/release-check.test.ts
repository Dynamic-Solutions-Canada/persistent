/** Linux updates must not mistake a newer Android/Windows release or wrong-CPU image for an available update. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findLinuxUpdate, linuxRelease, newerVersion } from './release-check.js'

const release = (name: string) => ({ tag_name: 'linux-v0.2.0', draft: false, prerelease: false, html_url: 'https://github.com/Dynamic-Solutions-Canada/persistent/releases/tag/linux-v0.2.0', assets: [{ name }] })

test('Linux checks skip unrelated packages, wrong CPU, prereleases and unsafe destinations', () => {
  assert.equal(linuxRelease([release('Persistent-0.30.0.apk')], 'x64'), null)
  assert.equal(linuxRelease([release('Persistent-Linux-0.2.0-arm64.AppImage')], 'x64'), null)
  assert.equal(linuxRelease([{ ...release('Persistent-Linux-0.2.0-x86_64.AppImage'), prerelease: true }], 'x64'), null)
  assert.equal(linuxRelease([{ ...release('Persistent-Linux-0.2.0-x86_64.AppImage'), html_url: 'https://evil.example/download' }], 'x64'), null)
  assert.equal(linuxRelease([release('Persistent-Linux-0.2.0-x86_64.AppImage')], 'x64')?.version, '0.2.0')
  assert.equal(linuxRelease([release('Persistent-Linux-0.2.0-arm64.AppImage')], 'arm64')?.version, '0.2.0')
})

test('version comparison is numeric and does not mistake an old package for an update', () => {
  assert.equal(newerVersion('0.10.0', '0.9.0'), true)
  assert.equal(newerVersion('0.2.0', '0.2.0'), false)
  assert.equal(newerVersion('0.1.9', '0.2.0'), false)
  assert.throws(() => newerVersion('invalid', '0.1.0'))
})

test('discovery skips malformed or unrelated tags and selects the newest version independently of response order', () => {
  const current = release('Persistent-Linux-0.2.0-x86_64.AppImage')
  const newer = { ...current, tag_name: 'linux-v0.3.0', html_url: 'https://github.com/Dynamic-Solutions-Canada/persistent/releases/tag/linux-v0.3.0', assets: [{ name: 'Persistent-Linux-0.3.0-x86_64.AppImage' }] }
  assert.equal(linuxRelease([current, newer], 'x64')?.version, '0.3.0')
  assert.equal(linuxRelease([{ ...current, tag_name: 'desktop-v0.2.0' }, { ...current, html_url: 'not a URL' }], 'x64'), null)
  assert.throws(() => newerVersion('999999999999999999999.0.0', '0.1.0'))
})

test('AppImage discovery accepts current manifests and ignores legacy Debian rows without selecting them', async () => {
  const asset = { architecture: 'x64', kind: 'AppImage', name: 'Persistent-Linux-0.2.0-x86_64.AppImage', size: 64, sha512: 'A'.repeat(86) + '==' }
  for (const artifacts of [[asset], [asset, { ...asset, kind: 'deb', name: 'Persistent-Linux-0.2.0-amd64.deb' }]]) {
    const update = await findLinuxUpdate('0.1.0', 'x64', async (url) => Response.json(url.includes('api.github.com')
      ? [release(asset.name)] : { format: 1, version: '0.2.0', artifacts }))
    assert.equal(update?.artifact.kind, 'AppImage')
    assert.equal(update?.artifact.name, asset.name)
  }
})
