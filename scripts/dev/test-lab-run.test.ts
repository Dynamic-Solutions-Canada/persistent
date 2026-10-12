import assert from 'node:assert/strict'
import test from 'node:test'
import { assertFreeProject, assertVirtualDevice, validateCapturePlan } from './test-lab-run.mjs'

test('free-only Test Lab rejects billed projects and unknown billing states', () => {
  for (const state of ['True', 'true', '', 'unknown', 'false\ntrue']) {
    assert.throws(() => assertFreeProject(state), /No job was submitted/)
  }
  assert.doesNotThrow(() => assertFreeProject('False\n'))
})

test('capture recipes reject duplicate exports and empty or unknown actions', () => {
  const capture = { action: 'capture', name: '00-current-light.png', surface: 'web', requiredControls: ['header', 'navigation'] }
  assert.equal(validateCapturePlan({ steps: [capture] }), 1)
  assert.equal(validateCapturePlan({ steps: [{ action: 'expand-notifications' }, capture] }), 1)
  assert.throws(() => validateCapturePlan({ steps: [capture, capture] }), /unique/)
  assert.throws(() => validateCapturePlan({ steps: [{ action: 'shell', command: '' }] }), /Missing/)
  assert.throws(() => validateCapturePlan({ steps: [{ action: 'invite' }] }), /Unknown/)
  assert.throws(() => validateCapturePlan({ steps: [{ ...capture, surface: undefined }] }), /surface/)
  assert.throws(() => validateCapturePlan({ steps: [{ ...capture, requiredControls: [] }] }), /control/)
  assert.throws(() => validateCapturePlan({ steps: [{ ...capture, requiredControls: ['header', 'header'] }] }), /control/)
  assert.throws(() => validateCapturePlan({ steps: [{ ...capture, surface: 'alarm' }] }), /title/)
  assert.equal(validateCapturePlan({ steps: [{ ...capture, surface: 'alarm', reminderTitle: 'Check the oven' }] }), 1)
  assert.equal(validateCapturePlan({ steps: [{ ...capture, surface: 'shade' }] }), 1)
})

// A real-looking model name alone must not bypass the user's virtual-device policy.
test('Test Lab requires a live virtual phone and supported API', () => {
  const device = { form: 'VIRTUAL', formFactor: 'PHONE', supportedVersionIds: ['35', '36'] }
  assert.doesNotThrow(() => assertVirtualDevice(device, '35'))
  assert.doesNotThrow(() => assertVirtualDevice(device, '36'))
  for (const candidate of [undefined, { ...device, form: 'PHYSICAL' }, { ...device, formFactor: 'TV' }]) {
    assert.throws(() => assertVirtualDevice(candidate, '35'), /No job was submitted/)
  }
  assert.throws(() => assertVirtualDevice(device, '37'), /No job was submitted/)
  assert.throws(() => assertVirtualDevice({ ...device, supportedVersionIds: ['33'] }, '33'), /No job was submitted/)
})
