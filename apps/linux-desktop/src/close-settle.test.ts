import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CLOSE_SETTLE_MS, shouldHonourClose } from './close-settle.js'

test('a page close within the settle window after opening is ignored', () => {
  assert.equal(CLOSE_SETTLE_MS, 500)
  assert.equal(shouldHonourClose(10_000, 10_000), false)
  assert.equal(shouldHonourClose(10_000, 10_499), false)
})

test('a page close after the settle window, or on a never-shown flyout, hides it', () => {
  assert.equal(shouldHonourClose(10_000, 10_500), true)
  assert.equal(shouldHonourClose(10_000, 60_000), true)
  assert.equal(shouldHonourClose(0, 5), true)
})
