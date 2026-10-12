/** Tray opening must stay on its display and remain visible after display-layout changes. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activationAnchor, openingPosition, panelCornerAnchor } from './window-placement.js'

test('bottom and top trays open on the interior side of their panel', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 }
  const size = { width: 420, height: 680 }
  assert.deepEqual(openingPosition(area, size, 'tray', { x: 1800, y: 1040, width: 32, height: 32 }), { x: 1488, y: 348 })
  assert.deepEqual(openingPosition(area, size, 'tray', { x: 1800, y: 0, width: 32, height: 32 }), { x: 1488, y: 12 })
  assert.deepEqual(openingPosition(area, size, 'tray', { x: 0, y: 1040, width: 32, height: 32 }), { x: 12, y: 348 })
  assert.deepEqual(openingPosition(area, size, 'tray', { x: 0, y: 0, width: 32, height: 32 }), { x: 12, y: 12 })
})

test('negative-coordinate monitors and missing saved positions retain the tray-side fallback', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1040 }
  const anchor = { x: -50, y: 1040, width: 1, height: 1 }
  assert.equal(openingPosition(area, { width: 420, height: 680 }, 'last', anchor).x, -432)
  assert.deepEqual(openingPosition(area, { width: 420, height: 680 }, 'last', anchor, { x: 5000, y: -5000 }), { x: -420, y: 0 })
})

test('missing icon bounds use the reserved panel corner rather than a zero or unrelated cursor position', () => {
  const bounds = { x: 0, y: 0, width: 1920, height: 1080 }
  const empty = { x: 0, y: 0, width: 0, height: 0 }
  assert.equal(activationAnchor(empty, { x: 0, y: 0 }), undefined)
  assert.deepEqual(activationAnchor(empty, { x: 1800, y: 1050 }), { x: 1800, y: 1050, width: 1, height: 1 })
  const bottom = panelCornerAnchor(bounds, { x: 0, y: 0, width: 1920, height: 1040 })
  const top = panelCornerAnchor(bounds, { x: 0, y: 40, width: 1920, height: 1040 })
  assert.equal(bottom.y, 1079)
  assert.equal(top.y, 0)
  assert.equal(bottom.x, 1919)
  assert.equal(panelCornerAnchor(bounds, { x: 40, y: 0, width: 1880, height: 1080 }).x, 0)
  assert.equal(panelCornerAnchor({ ...bounds, x: -1920 }, { x: -1920, y: 0, width: 1920, height: 1040 }).x, -1)
})
