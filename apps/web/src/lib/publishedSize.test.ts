/**
 * The published-size plumbing behind the floating controls. jsdom has no layout, so
 * element sizes are stubbed: these tests prove the property is written, followed and
 * removed, not that a real bar or button measures what the screen shows.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { publishSize } from './publishedSize.js'
import {
  BOTTOM_NAV_HEIGHT_VAR,
  bottomNavHeight,
  publishBottomNavHeight,
} from './fixedControlSizes.js'

/** An element whose bounding box reports `size`, which the test can change. */
function sizedElement(
  document: Document,
  size: { width: number; height: number },
) {
  const element = document.createElement('div')
  element.getBoundingClientRect = () =>
    ({
      ...size,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
    }) as DOMRect
  return element
}

test('publishSize writes the attached element size and removes it on detach', () => {
  const { document } = new JSDOM('<!doctype html><html></html>').window
  const root = document.documentElement
  const ref = publishSize('--thing-width', 'width', root)

  ref(sizedElement(document, { width: 186, height: 40 }))
  assert.equal(root.style.getPropertyValue('--thing-width'), '186px')

  // Unmounting the element must not leave a stale size behind.
  ref(null)
  assert.equal(root.style.getPropertyValue('--thing-width'), '')
})

test('publishSize follows resizes reported by ResizeObserver', () => {
  const { document } = new JSDOM('<!doctype html><html></html>').window
  const root = document.documentElement
  const callbacks: (() => void)[] = []
  const original = globalThis.ResizeObserver
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) {
      callbacks.push(callback)
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  try {
    const size = { width: 400, height: 57 }
    publishBottomNavHeight(root)(sizedElement(document, size))
    assert.equal(root.style.getPropertyValue(BOTTOM_NAV_HEIGHT_VAR), '57px')

    // A translated label wraps onto a second line: the bar grows by one line.
    size.height = 73
    callbacks.forEach((callback) => callback())
    assert.equal(root.style.getPropertyValue(BOTTOM_NAV_HEIGHT_VAR), '73px')
  } finally {
    globalThis.ResizeObserver = original
  }
})

test('bottomNavHeight falls back to the one-line bar plus the gesture-bar inset', () => {
  assert.match(
    bottomNavHeight(),
    /^var\(--bottom-nav-height, calc\(57px \+ max\(env\(safe-area-inset-bottom/,
  )
})
