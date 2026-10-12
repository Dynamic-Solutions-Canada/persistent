import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSyntheticAccounts, DEMO_EMAIL } from './test-lab-accounts.mjs'

test('capture fixture isolation rejects personal, missing and duplicate accounts and non-demo runtime', () => {
  const fixture = [{ email: DEMO_EMAIL }, { email: 'alex@example.test' }]
  assert.doesNotThrow(() => assertSyntheticAccounts(fixture, 'true'))
  assert.throws(() => assertSyntheticAccounts(fixture, 'false'), /isolated two-account/)
  assert.throws(() => assertSyntheticAccounts([...fixture, { email: 'personal@example.test' }], 'true'), /isolated two-account/)
  assert.throws(() => assertSyntheticAccounts([{ email: DEMO_EMAIL }, { email: DEMO_EMAIL }], 'true'), /isolated two-account/)
  assert.throws(() => assertSyntheticAccounts(fixture.slice(0, 1), 'true'), /isolated two-account/)
})
