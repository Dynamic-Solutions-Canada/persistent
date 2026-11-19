import assert from 'node:assert/strict'
import { test } from 'node:test'

import { accountExportFileName } from './account-export.js'

test('the export file is dated in the account time zone', () => {
  // 03:30 UTC on the 19th is still the 18th in Toronto.
  const now = new Date('2026-11-19T03:30:00Z')
  assert.equal(
    accountExportFileName('America/Toronto', now),
    'persistent-export-2026-11-18.json',
  )
  assert.equal(
    accountExportFileName('Asia/Tokyo', now),
    'persistent-export-2026-11-19.json',
  )
})

test('an unknown time zone dates the file in UTC', () => {
  assert.equal(
    accountExportFileName('Not/AZone', new Date('2026-11-19T03:30:00Z')),
    'persistent-export-2026-11-19.json',
  )
})
