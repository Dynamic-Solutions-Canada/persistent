import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installedPackageKind } from './installed-package.js'

test('only actual Debian package ownership enables privileged update installation', async () => {
  const executable = '/opt/Persistent/persistent'
  assert.equal(await installedPackageKind(true, undefined, executable, async () => `persistent: ${executable}\n`), 'deb')
  assert.equal(await installedPackageKind(true, undefined, executable, async () => `another-app: ${executable}\n`), null)
  assert.equal(await installedPackageKind(true, undefined, executable, async () => { throw new Error('Not installed') }), null)
  assert.equal(await installedPackageKind(false, '/user/Persistent.AppImage', executable), null)
  assert.equal(await installedPackageKind(true, '/user/Persistent.AppImage', executable, async () => { throw new Error('Must not query') }), 'AppImage')
})
