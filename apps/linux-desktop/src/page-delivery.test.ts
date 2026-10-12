/** Notification clicks during bootstrap and SPA navigation must reach the correct listener once. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PageDelivery, type PageRequest } from './page-delivery.js'

test('Snooze waits for its authenticated listener, while SPA routes keep both listeners ready', () => {
  const messages: PageRequest[] = []
  const delivery = new PageDelivery((message) => messages.push(message))
  delivery.queue({ type: 'snoozeOccurrence', occurrenceId: 'one' })
  delivery.ready()
  assert.deepEqual(messages, [])
  delivery.ready(true)
  assert.deepEqual(messages, [{ type: 'snoozeOccurrence', occurrenceId: 'one' }])
  delivery.navigating({ isMainFrame: true, isSameDocument: true })
  delivery.queue({ type: 'snoozeOccurrence', occurrenceId: 'two' })
  delivery.flush()
  assert.equal(messages.length, 2)
  delivery.navigating({ isMainFrame: false, isSameDocument: false })
  delivery.queue({ type: 'navigate', path: '/settings' })
  delivery.flush()
  assert.equal(messages.length, 3)
})

test('full document replacement buffers the latest click, and sign-out discards personal pending actions', () => {
  const messages: PageRequest[] = []
  const delivery = new PageDelivery((message) => messages.push(message))
  delivery.ready(); delivery.ready(true)
  delivery.navigating({ isMainFrame: true, isSameDocument: false })
  delivery.queue({ type: 'navigate', path: '/first' })
  delivery.queue({ type: 'navigate', path: '/latest' })
  delivery.flush()
  assert.equal(messages.length, 0)
  delivery.ready()
  assert.deepEqual(messages, [{ type: 'navigate', path: '/latest' }])
  delivery.queue({ type: 'snoozeOccurrence', occurrenceId: 'old-account' })
  delivery.signedOut()
  delivery.ready(true)
  assert.equal(messages.length, 1)
})
