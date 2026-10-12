/** Consent, concurrency and shutdown are independent of native dialogs and release transport. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UpdateController } from './update-controller.js'
import type { LinuxUpdate } from './release-check.js'

const update: LinuxUpdate = { version: '0.2.0', tag: 'linux-v0.2.0', url: 'https://github.com/RyanEwen/persistent/releases/tag/linux-v0.2.0',
  downloadUrl: 'https://github.com/RyanEwen/persistent/releases/download/linux-v0.2.0/Persistent-Linux-0.2.0-x86_64.AppImage',
  artifact: { name: 'Persistent-Linux-0.2.0-x86_64.AppImage', architecture: 'x64', kind: 'AppImage', size: 64, sha512: 'A'.repeat(86) + '==' } }

function fixture() {
  const consent = [false, false]
  const calls: string[] = []
  const options = {
    automatic: true,
    find: async () => { calls.push('find'); return update },
    confirm: async (action: string) => { calls.push(action); return consent.shift() ?? false },
    download: async () => { calls.push('downloaded'); return '/private/update' },
    install: async () => { calls.push('installed') }, changed: () => {}, log: () => {}
  }
  return { options, calls, consent }
}

test('automatic discovery cannot download without consent and does not repeatedly nag for one version', async () => {
  const f = fixture(); const controller = new UpdateController(f.options)
  assert.equal((await controller.check(false)).phase, 'available')
  await controller.check(false)
  assert.deepEqual(f.calls, ['find', 'download', 'find'])
  controller.setAutomatic(false)
  await controller.check(false)
  assert.equal(f.calls.length, 3)
  await controller.check(true)
  assert.deepEqual(f.calls.slice(3), ['find', 'download'])
})

test('approved download requires a separate install consent; manual install can proceed later', async () => {
  const f = fixture(); f.consent.splice(0, 2, true, false, true)
  const controller = new UpdateController(f.options)
  const ready = await controller.check()
  assert.equal(ready.phase, 'ready')
  assert.equal(ready.downloaded, true)
  assert.deepEqual(f.calls, ['find', 'download', 'downloaded', 'install'])
  await controller.install()
  assert.equal(f.calls.at(-1), 'installed')
})

test('coalesced manual and automatic requests produce only one consent dialog', async () => {
  const f = fixture(); let resolve!: (value: LinuxUpdate) => void
  f.options.find = () => new Promise((accept) => { resolve = accept })
  const controller = new UpdateController(f.options)
  const one = controller.check(); const two = controller.check(false); const three = controller.download()
  resolve(update)
  await Promise.all([one, two, three])
  assert.deepEqual(f.calls, ['download'])
})

test('shutdown and an automatic-preference change fence pending discovery and prompts', async () => {
  for (const stop of [true, false]) {
    const f = fixture(); let resolve!: (value: LinuxUpdate) => void
    f.options.find = () => new Promise((accept) => { resolve = accept })
    const controller = new UpdateController(f.options)
    const pending = controller.check(false)
    if (stop) controller.stop(); else controller.setAutomatic(false)
    resolve(update); await pending
    assert.deepEqual(f.calls, [])
  }
})

test('download failures cannot install; failed installations retain the verified file for retry', async () => {
  const f = fixture(); f.consent.splice(0, 2, true, true, true)
  let installs = 0
  f.options.install = async () => { if (++installs === 1) throw new Error('Approval refused') }
  const controller = new UpdateController(f.options)
  assert.equal((await controller.check()).phase, 'error')
  assert.equal(controller.snapshot().downloaded, true)
  await controller.install()
  assert.equal(installs, 2)
  const rejected = fixture(); rejected.consent[0] = true
  rejected.options.download = async () => { throw new Error('Checksum mismatch') }
  const bad = new UpdateController(rejected.options)
  assert.equal((await bad.check()).phase, 'error')
  await bad.install()
  assert.equal(rejected.calls.includes('installed'), false)
})
