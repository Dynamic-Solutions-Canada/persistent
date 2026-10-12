import assert from 'node:assert/strict'
import test from 'node:test'
import { isCaptureSignIn, isCaptureEscalation, mayDeleteCaptureReminder } from './test-lab-demo-policy.mjs'
import { DEMO_EMAIL } from './test-lab-accounts.mjs'

const oven = {
  title: 'Check the oven', details: 'Take the tray out, then turn the oven off.',
  persistence: 'PERSISTENT', schedule: { kind: 'none', timesOfDay: [] },
  escalateAfterMinutes: 1, startDate: '2026-10-12'
}

test('capture auth validates the shared body contract and refuses non-fixture addresses', () => {
  assert.equal(isCaptureSignIn('/api/auth/request-code', { email: DEMO_EMAIL }), true)
  assert.equal(isCaptureSignIn('/api/auth/verify-code', { email: DEMO_EMAIL }), false)
  assert.equal(isCaptureSignIn('/api/auth/verify-code', { email: DEMO_EMAIL, code: '123456' }), true)
  assert.equal(isCaptureSignIn('/api/auth/request-code', { email: 'personal@example.test' }), false)
  assert.equal(isCaptureSignIn('/api/auth/other', { email: DEMO_EMAIL, code: '123456' }), false)
})

test('capture creation refuses malformed and additional escalation behavior', () => {
  assert.equal(isCaptureEscalation(oven), true)
  for (const value of [null, { ...oven, startDate: undefined }, { ...oven, title: 'Other' },
    { ...oven, escalateEmail: 'outside@example.test' }, { ...oven, active: false },
    { ...oven, persistence: 'ALARM' }, { ...oven, escalateAfterMinutes: 2 }]) {
    assert.equal(isCaptureEscalation(value), false)
  }
})

test('capture delete refuses anonymous and foreign owners before permitting the exact fixture', async () => {
  let calls = 0
  const find = async (query: { where: { id: string; userId: string } }) => {
    calls++
    assert.equal(query.where.id, 'oven-id')
    return query.where.userId === 'owner-id' ? oven : null
  }
  assert.equal(await mayDeleteCaptureReminder(undefined, 'oven-id', find), false)
  assert.equal(calls, 0)
  assert.equal(await mayDeleteCaptureReminder('foreign-id', 'oven-id', find), false)
  assert.equal(await mayDeleteCaptureReminder('owner-id', 'oven-id', find), true)
})
