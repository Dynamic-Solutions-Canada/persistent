import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toStorageCookie } from './demo-session.ts'

test('a session Set-Cookie becomes a storageState cookie with an absolute expiry', () => {
  const nowMs = Date.parse('2026-11-19T22:00:00.000Z')
  const cookie = toStorageCookie(
    'persistent_auth=abc.def=; Path=/; Max-Age=600; HttpOnly; SameSite=Strict',
    'localhost',
    nowMs,
  )
  assert.deepEqual(cookie, {
    name: 'persistent_auth',
    value: 'abc.def=',
    domain: 'localhost',
    path: '/',
    expires: nowMs / 1000 + 600,
    httpOnly: true,
    secure: false,
    sameSite: 'Strict',
  })
})

test('Max-Age wins over Expires, and a header without a pair is ignored', () => {
  const nowMs = Date.parse('2026-11-19T22:00:00.000Z')
  const cookie = toStorageCookie(
    'a=1; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Max-Age=5; Secure; SameSite=None',
    'localhost',
    nowMs,
  )
  assert.equal(cookie?.expires, nowMs / 1000 + 5)
  assert.equal(cookie?.secure, true)
  assert.equal(cookie?.sameSite, 'None')
  assert.equal(toStorageCookie('; Path=/', 'localhost'), null)
})
