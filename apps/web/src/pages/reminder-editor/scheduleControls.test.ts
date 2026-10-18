/** Pausing only makes sense while a definition can still schedule another firing. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyForm, fromReminder, toInput } from './formState.js'
import { hasConsumedOneTimeSchedule, showScheduleEnabled } from './scheduleControls.js'
import type { Reminder } from '@persistent/shared'

test('schedule enabled is absent for timeless definitions and restores for scheduled ones', () => {
  const form = emptyForm()
  for (const when of ['never', 'now'] as const) {
    assert.equal(showScheduleEnabled({ ...form, when }), false)
    assert.equal(toInput({ ...form, when, active: false }).active, true)
  }
  assert.equal(showScheduleEnabled({ ...form, when: 'scheduled' }), true)
})

test('a consumed one-time schedule cannot be paused, but changing its time permits scheduling again', () => {
  const existing = {
    ...toInput({ ...emptyForm(), when: 'scheduled', kind: 'once', startDate: '2026-10-18', timesOfDay: ['12:00'] }),
    id: 'reminder', checkedItemIds: [], hideCheckedItems: false,
    lastOccurrence: { status: 'ACKNOWLEDGED', scheduledFor: '2026-10-18T12:00:00Z' }
  } as unknown as Reminder
  const form = fromReminder(existing)
  const now = new Date(2026, 9, 18, 14, 0)
  assert.equal(hasConsumedOneTimeSchedule(form, existing, now), true)
  assert.equal(showScheduleEnabled(form, existing, now), false)
  assert.equal(showScheduleEnabled({ ...form, timesOfDay: ['13:00'] }, existing), true)
  assert.equal(showScheduleEnabled({ ...form, kind: 'daily' }, existing), true)
  assert.equal(showScheduleEnabled(form, { ...existing, lastOccurrence: { ...existing.lastOccurrence!, status: 'PENDING' } }), true)
})

test('a saved future one-time schedule remains enabled when an older firing is complete', () => {
  const existing = {
    ...toInput({ ...emptyForm(), when: 'scheduled', kind: 'once', startDate: '2026-10-20', timesOfDay: ['12:00'] }),
    lastOccurrence: { status: 'ACKNOWLEDGED', scheduledFor: '2026-10-18T12:00:00Z' }
  } as unknown as Reminder
  assert.equal(showScheduleEnabled(fromReminder(existing), existing, new Date(2026, 9, 18, 14, 0)), true)
})
