/** Schedule controls apply to future firings, never to notes or completed obligations. */
import { nextFire } from '../../lib/schedule-preview.js'
import type { Reminder } from '@persistent/shared'
import { fromReminder, previewInput, type FormState } from './formState.js'

export function hasConsumedOneTimeSchedule(form: FormState, existing?: Reminder, now = new Date()): boolean {
  return Boolean(form.when === 'scheduled' && form.kind === 'once' && existing?.lastOccurrence &&
    existing.lastOccurrence.status !== 'PENDING' &&
    nextFire(previewInput(form), now) === null &&
    JSON.stringify(previewInput(form)) === JSON.stringify(previewInput(fromReminder(existing))))
}

export function showScheduleEnabled(form: FormState, existing?: Reminder, now = new Date()): boolean {
  return form.when === 'scheduled' && !hasConsumedOneTimeSchedule(form, existing, now)
}
