/** Sliding cookie expiry must preserve alarms, while account replacement and logout fence them immediately. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { Session } from 'electron'
import { ProfileSession } from './profile-session.js'

test('same-token replacement is quiet, another account resets delivery, and logout pauses it', async () => {
  const changes: boolean[] = []
  const emitter = new EventEmitter()
  const current = { name: 'persistent_auth', value: 'synthetic-one', httpOnly: true, domain: 'localhost' }
  const cookies = Object.assign(emitter, { get: async () => [current] }) as unknown as Session['cookies']
  const session = new ProfileSession(cookies, () => 'http://localhost', () => {})
  await session.watch((paused) => changes.push(paused))
  try {
    emitter.emit('changed', {}, current, 'overwrite', true)
    emitter.emit('changed', {}, current, 'explicit', false)
    assert.deepEqual(changes, [])
    const another = { ...current, value: 'synthetic-two' }
    emitter.emit('changed', {}, another, 'explicit', false)
    assert.deepEqual(changes, [false])
    emitter.emit('changed', {}, another, 'explicit', true)
    assert.deepEqual(changes, [false, true])
    emitter.emit('changed', {}, { ...current, domain: 'other.example' }, 'explicit', false)
    emitter.emit('changed', {}, { ...current, httpOnly: false }, 'explicit', false)
    assert.deepEqual(changes, [false, true])
  } finally { session.dispose() }
})
