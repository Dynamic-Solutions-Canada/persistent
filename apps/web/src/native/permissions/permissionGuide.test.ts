import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFullySetUp, missingGrants, normalizeReadiness, routeFor, type AlarmGrant, type AlarmReadiness } from './alarmGrants.js'
import { guideReducer, initialGuide, isGuideFinished, type GuideEvent, type GuideState } from './permissionGuide.js'

const ALL: AlarmGrant[] = ['notifications', 'exactAlarms', 'fullScreen', 'overlay', 'battery']

/** Readiness with every grant held except the ones listed. */
function readinessMissing(...missing: AlarmGrant[]): AlarmReadiness {
  return Object.fromEntries(ALL.map((grant) => [grant, !missing.includes(grant)])) as AlarmReadiness
}

function run(state: GuideState, ...events: GuideEvent[]): GuideState {
  return events.reduce(guideReducer, state)
}

test('an older host that does not report a grant never shows it as missing', () => {
  const oldHost = normalizeReadiness({ notifications: true, fullScreen: false, exactAlarms: true, overlay: true })
  assert.equal(oldHost.battery, undefined)
  assert.deepEqual(missingGrants(oldHost, ALL), ['fullScreen'])
  assert.deepEqual(missingGrants(normalizeReadiness(null), ALL), [])
  assert.deepEqual(missingGrants(normalizeReadiness({ notifications: 'no' }), ALL), [])
})

test('already-granted and not-applicable grants never produce a step', () => {
  const state = run(initialGuide(ALL), { type: 'readiness', readiness: readinessMissing() })
  assert.equal(state.current, null)
  assert.ok(isGuideFinished(state))
})

test('grants are asked one at a time, most important first, and only within scope', () => {
  const readiness = readinessMissing('battery', 'overlay', 'notifications')
  assert.equal(run(initialGuide(ALL), { type: 'readiness', readiness }).current, 'notifications')
  assert.equal(run(initialGuide(['overlay', 'battery']), { type: 'readiness', readiness }).current, 'overlay')
})

test('the guide is not finished before readiness has been read', () => {
  assert.equal(isGuideFinished(initialGuide(ALL)), false)
})

test('returning from settings with the grant on moves to the next explanation', () => {
  let state = run(initialGuide(ALL), { type: 'readiness', readiness: readinessMissing('fullScreen', 'overlay') })
  state = run(state, { type: 'launched', grant: 'fullScreen', route: 'settings', opened: true })
  assert.equal(state.phase, 'waiting')
  state = run(state, { type: 'readiness', readiness: readinessMissing('overlay') })
  assert.equal(state.current, 'overlay')
  assert.equal(state.phase, 'explain')
})

test('returning with the grant still off offers to try again instead of advancing', () => {
  let state = run(initialGuide(ALL), { type: 'readiness', readiness: readinessMissing('overlay') })
  state = run(state, { type: 'launched', grant: 'overlay', route: 'settings', opened: true })
  state = run(state, { type: 'readiness', readiness: readinessMissing('overlay') })
  assert.equal(state.current, 'overlay')
  assert.equal(state.phase, 'stillOff')
})

test('a screen the device cannot open shows the manual route, and Not now still works', () => {
  let state = run(initialGuide(ALL), { type: 'readiness', readiness: readinessMissing('exactAlarms', 'battery') })
  state = run(state, { type: 'launched', grant: 'exactAlarms', route: 'settings', opened: false })
  assert.equal(state.phase, 'unavailable')
  // A re-check that finds it still off keeps the manual route visible.
  state = run(state, { type: 'readiness', readiness: readinessMissing('exactAlarms', 'battery') })
  assert.equal(state.phase, 'unavailable')
  state = run(state, { type: 'notNow' })
  assert.equal(state.current, 'battery')
  assert.equal(state.phase, 'explain')
})

test('Not now while waiting moves on and is not undone by the late resume', () => {
  let state = run(initialGuide(ALL), { type: 'readiness', readiness: readinessMissing('fullScreen', 'overlay') })
  state = run(state, { type: 'launched', grant: 'fullScreen', route: 'settings', opened: true }, { type: 'notNow' })
  assert.equal(state.current, 'overlay')
  state = run(state, { type: 'readiness', readiness: readinessMissing('fullScreen', 'overlay') })
  assert.equal(state.current, 'overlay')
  assert.equal(state.phase, 'explain')
  // A launch result that arrives for the grant already put off is ignored.
  assert.equal(run(state, { type: 'launched', grant: 'fullScreen', route: 'settings', opened: false }).phase, 'explain')
})

test('declining every remaining grant finishes the guide', () => {
  let state = run(initialGuide(ALL), { type: 'readiness', readiness: readinessMissing('overlay', 'battery') })
  state = run(state, { type: 'notNow' }, { type: 'notNow' })
  assert.ok(isGuideFinished(state))
  assert.deepEqual(state.declined, ['overlay', 'battery'])
})

test('notifications try the runtime prompt once, then fall back to settings', () => {
  assert.equal(routeFor('notifications', false), 'prompt')
  let state = run(initialGuide(ALL), { type: 'readiness', readiness: readinessMissing('notifications') })
  state = run(state, { type: 'launched', grant: 'notifications', route: 'prompt', opened: true })
  state = run(state, { type: 'readiness', readiness: readinessMissing('notifications') })
  assert.equal(state.phase, 'stillOff')
  assert.ok(state.promptTried.includes('notifications'))
  assert.equal(routeFor('notifications', true), 'settings')
  // Grants without a runtime prompt always use their settings screen.
  assert.equal(routeFor('overlay', false), 'settings')
})

test('fully set up means every grant is held, not just the ones one guide asked about', () => {
  // The banner opens a one-grant guide; granting it must not claim full setup while others remain.
  const oneGuide = run(initialGuide(['overlay']), { type: 'readiness', readiness: readinessMissing('fullScreen') })
  assert.ok(isGuideFinished(oneGuide))
  assert.equal(isFullySetUp(oneGuide.readiness!), false)
  assert.equal(isFullySetUp(readinessMissing()), true)
  // A grant an older host doesn't report is unknown, not missing.
  assert.equal(isFullySetUp(normalizeReadiness({ notifications: true, exactAlarms: true, fullScreen: true, overlay: true })), true)
})

test('only grants that reached the screen count as shown', () => {
  let state = run(initialGuide(ALL), { type: 'readiness', readiness: readinessMissing('notifications', 'overlay', 'battery') })
  assert.deepEqual(state.shown, ['notifications'])
  state = run(state, { type: 'notNow' })
  assert.deepEqual(state.shown, ['notifications', 'overlay'])
  // Closing here (Back) leaves battery unshown, so the first-run guide can offer it again.
  assert.equal(state.shown.includes('battery'), false)
})
