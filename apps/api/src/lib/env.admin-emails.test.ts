/** ADMIN_EMAILS parsing: normalised addresses from a comma-separated value, invalid entries refused. */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
process.env.ADMIN_EMAILS = ' Admin@Example.test, second@example.test ,,'
const { env } = await import('./env.js')

test('ADMIN_EMAILS becomes a trimmed, lower-cased list without empty entries', () => {
  assert.deepEqual(env.ADMIN_EMAILS, [
    'admin@example.test',
    'second@example.test',
  ])
})
