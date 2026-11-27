/** The Store screenshots' synthetic sample data covers every captured listing locale alike. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  captureLocales,
  demoText,
  demoTextProblems,
  readDemoTextFile,
} from './store-demo-text.ts'

test('every locale has the same scenarios, fields and checklist lengths as en-US, without em dashes', () => {
  assert.deepEqual(demoTextProblems(readDemoTextFile()), [])
})

test('each store captures exactly the locales the sample data covers', () => {
  const covered = Object.keys(readDemoTextFile().locales).sort()
  for (const listings of [
    'store-assets/microsoft/listings.json',
    'store-assets/play/listings.json',
  ]) {
    assert.deepEqual(captureLocales(listings).sort(), covered, listings)
  }
})

test('a missing locale fails instead of falling back to English', () => {
  assert.throws(() => demoText('it-IT'), /no it-IT record/)
})

test('the checks catch drift', () => {
  const file = {
    schemaVersion: 1,
    locales: {
      'en-US': { trip: { title: 'Trip', items: ['A', 'B'] } },
      'de-DE': { trip: { title: 'Reise \u2014 bald', items: ['A'] } },
    },
  }
  const problems = demoTextProblems(file)
  assert.ok(problems.some((p) => /checklist length/.test(p)))
  assert.ok(problems.some((p) => /em dash/.test(p)))
})
