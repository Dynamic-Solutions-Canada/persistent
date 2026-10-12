/** A late old-daemon result or close must never target another daemon's reused numeric ID. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NotificationHandles } from './notification-handles.js'

test('daemon ID reuse cannot collide with an application handle or delayed cleanup', () => {
  const handles = new NotificationHandles()
  const old = { CloseNotification: async () => {} }; const current = { CloseNotification: async () => {} }
  const retired = handles.register(old, 7)
  assert.equal(handles.register(old, 7), retired)
  assert.equal(handles.replacement(retired, current), 0)
  const previous = handles.retire()
  assert.equal(previous[0]?.owner, old)
  const fresh = handles.register(current, 7)
  assert.notEqual(retired, fresh)
  assert.equal(handles.take(retired), undefined)
  assert.equal(handles.find(current, 7), fresh)
  assert.equal(handles.replacement(fresh, current), 7)
  assert.equal(handles.take(fresh)?.owner, current)
  assert.equal(handles.find(current, 7), undefined)
  assert.throws(() => handles.register(current, 0))
})
