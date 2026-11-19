import assert from 'node:assert/strict'
import test from 'node:test'
import { redactPrismaLogMessage } from './prisma-client.js'

test('a validation error keeps only the line naming the call, never its arguments', () => {
  const message = [
    '',
    'Invalid `prisma.user.create()` invocation:',
    '',
    '{',
    '  data: {',
    '    email: "someone@example.test",',
    '  }',
    '}',
    'Unknown argument `notAField`.',
  ].join('\n')
  const redacted = redactPrismaLogMessage(message)
  assert.equal(redacted, 'Invalid `prisma.user.create()` invocation:')
  assert.ok(!redacted.includes('someone@example.test'))
})

test('a one-line message is kept whole, and an empty one is named', () => {
  assert.equal(
    redactPrismaLogMessage('Unique constraint failed on the fields: (`email`)'),
    'Unique constraint failed on the fields: (`email`)',
  )
  assert.equal(redactPrismaLogMessage('\n  \n'), '(empty Prisma log message)')
})
