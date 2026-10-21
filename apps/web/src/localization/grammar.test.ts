import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configureLocale, tr } from './i18n.js'
import { monthlyDaysText, scheduleSummary } from '../lib/scheduleSummary.js'
import { formatNumber, ordinal } from '../lib/format.js'

test('schedule plurals, list grammar and ordinal dates use the selected wording', () => {
  try {
    configureLocale('fr-CA', 'fr-CA')
    assert.equal(tr('preview.minutes', { count: 1 }), ', dans 1 minute')
    assert.equal(tr('preview.minutes', { count: 2 }), ', dans 2 minutes')
    assert.equal(monthlyDaysText({ kind: 'monthly', timesOfDay: ['13:00'], daysOfMonth: [1, 15] }), 'le 1er et 15')
    configureLocale('de-DE', 'de-DE')
    assert.equal(ordinal(15), '15.')
    assert.equal(scheduleSummary({ kind: 'interval', everyNDays: 2, timesOfDay: ['13:00'] }, '24h'), 'Alle 2 Tage um 13:00')
    assert.equal(formatNumber(1234.5), '1.234,5')
    configureLocale('ja-JP', 'en-CA')
    assert.equal(tr('preview.minutes', { count: 2 }), '（2 分後）')
    assert.equal(formatNumber(1234.5), '1,234.5')
    assert.equal(ordinal(1), '1 日')
  } finally {
    configureLocale('en-US', 'en-US')
  }
})
