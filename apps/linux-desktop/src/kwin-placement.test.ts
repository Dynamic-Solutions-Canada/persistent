/** Exercise the exact script sent to KWin, including ownership fences and native-pixel anchors. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { kwinPlacementScript, type KwinPlacement } from './kwin-placement.js'

function fixture(config: Partial<KwinPlacement> = {}, scale = 1, x = 0) {
  const callbacks: (() => void)[] = []
  const geometryCallbacks: (() => void)[] = []
  const moveCallbacks: (() => void)[] = []
  const own = { pid: 42, caption: 'Persistent - Reminders', frameGeometry: { x: 200, y: 50, width: 420, height: 680 },
    skipTaskbar: false, skipPager: false, skipSwitcher: false, keepAbove: false,
    captionChanged: { connect: (fn: () => void) => callbacks.push(fn) },
    frameGeometryChanged: { connect: (fn: () => void) => geometryCallbacks.push(fn) },
    interactiveMoveResizeStarted: { connect: (fn: () => void) => moveCallbacks.push(fn) } }
  const signIn = { ...own, caption: 'Persistent' }
  const otherProcess = { ...own, pid: 43 }
  const screen = { geometry: { x, y: 0, width: 1280, height: 800 }, devicePixelRatio: scale }
  const workspace = { activeScreen: screen, screens: [screen], currentDesktop: {},
    clientArea: () => ({ x, y: 0, width: 1280, height: 752 }),
    windowList: () => [own, signIn, otherProcess], windowAdded: { connect: () => {} } }
  runInNewContext(kwinPlacementScript({ pid: 42, title: own.caption, placement: 'tray', ...config }), { workspace, KWin: { PlacementArea: 0 } })
  return { own, signIn, otherProcess, callbacks, geometryCallbacks, moveCallbacks }
}

test('KWin moves only this process flyout, leaving sign-in and other processes untouched', () => {
  const { own, signIn, otherProcess } = fixture()
  assert.deepEqual(JSON.parse(JSON.stringify(own.frameGeometry)), { x: 848, y: 60, width: 420, height: 680 })
  assert.equal(own.skipTaskbar && own.skipSwitcher && own.keepAbove, true)
  for (const untouched of [signIn, otherProcess]) {
    assert.equal(untouched.frameGeometry.x, 200)
    assert.equal(untouched.skipTaskbar, false)
  }
})

test('native-pixel tray anchors convert on scaled and negative-origin outputs', () => {
  const { own } = fixture({ anchor: { x: -1120, y: 16, width: 32, height: 32 } }, 2, -1280)
  assert.deepEqual(JSON.parse(JSON.stringify(own.frameGeometry)), { x: -1268, y: 12, width: 420, height: 680 })
})

test('center and last-position preferences still use the shared work-area clamp', () => {
  assert.equal(fixture({ placement: 'center' }).own.frameGeometry.x, 430)
  const { own } = fixture({ placement: 'last', saved: { x: 5000, y: -100 } })
  assert.equal(own.frameGeometry.x, 860)
  assert.equal(own.frameGeometry.y, 0)
})

test('a later page caption cannot turn the sign-in shell into a flyout', () => {
  const { own, callbacks } = fixture()
  own.caption = 'Persistent'
  own.frameGeometry = { x: 20, y: 20, width: 420, height: 680 }
  callbacks.forEach((fn) => fn())
  assert.equal(own.frameGeometry.x, 20)
})

test('a late centered Wayland commit is corrected, but an interactive drag stays where the user puts it', () => {
  const { own, geometryCallbacks, moveCallbacks } = fixture()
  own.frameGeometry = { x: 430, y: 36, width: 420, height: 680 }
  geometryCallbacks.forEach((fn) => fn())
  assert.equal(own.frameGeometry.x, 848)
  moveCallbacks.forEach((fn) => fn())
  own.frameGeometry = { x: 200, y: 36, width: 420, height: 680 }
  geometryCallbacks.forEach((fn) => fn())
  assert.equal(own.frameGeometry.x, 200)
})
