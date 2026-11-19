import assert from 'node:assert/strict'
import test from 'node:test'
import { describeError } from './logger.js'

test('an error is described by its class, code and frame, never its message', () => {
  const error = Object.assign(
    new Error(
      'Invalid `prisma.user.create()` invocation: { email: "someone@example.test" }',
    ),
    { code: 'P2002' },
  )
  const summary = describeError(error)
  assert.equal(summary.name, 'Error')
  assert.equal(summary.code, 'P2002')
  assert.ok(summary.at && summary.at.length > 0)
  assert.ok(!JSON.stringify(summary).includes('someone@example.test'))
})

test('a JSON parse error does not quote the body, and a thrown non-error is named by its type', () => {
  let parseError: unknown
  try {
    JSON.parse('{"secret":"value" x')
  } catch (error) {
    parseError = error
  }
  const summary = describeError(parseError)
  assert.equal(summary.name, 'SyntaxError')
  assert.equal(summary.code, undefined)
  assert.ok(!JSON.stringify(summary).includes('secret'))
  assert.deepEqual(describeError('a string'), { name: 'string' })
})
