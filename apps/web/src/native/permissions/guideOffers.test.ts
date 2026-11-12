import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeReadiness } from './alarmGrants.js'
import { grantsToOffer, readOfferedGrants, recordOfferedGrants } from './guideOffers.js'

const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
let store: Map<string, string>

beforeEach(() => {
  store = new Map()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value)
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
})

afterEach(() => {
  if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

const readiness = normalizeReadiness({ notifications: false, exactAlarms: true, fullScreen: false, overlay: true, battery: false })

test('a first launch offers every missing grant, most important first', () => {
  assert.deepEqual(grantsToOffer(readiness, readOfferedGrants()), ['notifications', 'fullScreen', 'battery'])
})

test('grants already offered on this device are not offered again on a later launch', () => {
  recordOfferedGrants(['notifications', 'fullScreen'])
  recordOfferedGrants(['battery'])
  assert.deepEqual(grantsToOffer(readiness, readOfferedGrants()), [])
})

test('a grant that newly goes missing brings the guide back for that grant only', () => {
  recordOfferedGrants(['notifications', 'fullScreen', 'battery'])
  const later = normalizeReadiness({ notifications: false, exactAlarms: true, fullScreen: false, overlay: false, battery: false })
  assert.deepEqual(grantsToOffer(later, readOfferedGrants()), ['overlay'])
})

test('unreadable or unknown stored values are ignored rather than trusted', () => {
  store.set('persistent-permission-guide-offered', '{not json')
  assert.deepEqual(readOfferedGrants(), [])
  store.set('persistent-permission-guide-offered', JSON.stringify(['overlay', 'bogus', 3]))
  assert.deepEqual(readOfferedGrants(), ['overlay'])
})
