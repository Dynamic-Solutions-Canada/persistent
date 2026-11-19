/** Admin designation is exact and configured; runtime access uses the stored role, not an email check. */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
const { initialAdminGrant, requireAdmin } = await import('./admin-access.js')

test('only a configured initial administrator receives an initial grant', () => {
  const administrators = ['admin@example.test', 'second@example.test']
  assert.equal(initialAdminGrant('  Admin@Example.test ', administrators), true)
  assert.equal(initialAdminGrant('second@example.test', administrators), true)
  for (const email of [
    'other@example.test',
    'admin+extra@example.test',
    'admin@example.test.example.org',
  ]) {
    assert.equal(initialAdminGrant(email, administrators), false)
  }
})

test('with no configured administrators, nobody is granted', () => {
  assert.equal(initialAdminGrant('admin@example.test', []), false)
})

test('anonymous access is rejected before the database lookup', async () => {
  await assert.rejects(requireAdmin({} as never), { statusCode: 401 })
})
