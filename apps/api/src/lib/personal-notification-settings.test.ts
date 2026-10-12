/** Owners and recipients must never inherit another participant's edited display setting. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reminderForActor } from './personal-notification-settings.js'

test('owner and each shared member have independent notification prominence', () => {
  const reminder = { userId: 'owner', shadeProminence: 'MINIMIZED' as const, title: 'Shared title' }
  assert.equal(reminderForActor(reminder, 'owner', { shadeProminence: 'NORMAL' }).shadeProminence, 'MINIMIZED')
  assert.equal(reminderForActor(reminder, 'member', { shadeProminence: 'NORMAL' }).shadeProminence, 'NORMAL')
  assert.equal(reminderForActor(reminder, 'member', null).shadeProminence, 'INHERIT')
  assert.equal(reminder.shadeProminence, 'MINIMIZED')
  assert.equal(reminderForActor(reminder, 'member', { shadeProminence: 'NORMAL' }).title, reminder.title)
})
