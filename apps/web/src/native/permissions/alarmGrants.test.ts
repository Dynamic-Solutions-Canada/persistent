import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogs } from '@persistent/shared'
import { ALARM_GRANTS } from './alarmGrants.js'

// The repo's catalog audit only sees literal tr() calls; this copy is data, so check it here.
test('every grant explanation has a catalog entry', () => {
  const english = catalogs['en-US']!
  for (const copy of ALARM_GRANTS) {
    const keys = [copy.title, copy.consequence, copy.why, copy.manualPath, ...Object.values(copy.instructions)]
    for (const key of keys) assert.ok(english[key!], `${copy.grant}: ${key}`)
  }
})
