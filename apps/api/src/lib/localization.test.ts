import assert from 'node:assert/strict'
import { test } from 'node:test'
import { supportedLocales } from '@persistent/shared'
import { localizedError } from './localized-error.js'
import { escalationEmailText, notificationBody } from './notification-format.js'
import { buildAssignmentInvitationEmail, buildShareInvitationEmail } from './share-invitation-email.js'
import { buildVerificationEmail } from './verification-email.js'

test('localized errors add stable copy while preserving the legacy English wire', () => {
  assert.deepEqual(localizedError('Reminder not found.', 'de-DE'), {
    error: 'Reminder not found.', code: 'error.reminder-not-found', message: 'Erinnerung nicht gefunden.'
  })
  for (const provider of ['__proto__', 'constructor', 'toString']) {
    assert.equal(localizedError(provider, 'ja-JP').code, 'error.request-failed')
  }
  const unknown = localizedError('Provider text {{secret}}', 'ja-JP')
  assert.equal(unknown.code, 'error.request-failed')
  assert.equal(unknown.error, 'Provider text {{secret}}')
  assert.equal(unknown.message, 'リクエストに失敗しました。')
})

test('email templates localize application copy and escape sender text without exposing reminder data', () => {
  for (const locale of supportedLocales) {
    const input = { ownerName: '<owner & {{email}}>', email: 'recipient@example.test', appUrl: 'https://persistent.test/?a=1&b=2', locale }
    for (const build of [buildShareInvitationEmail, buildAssignmentInvitationEmail]) {
      const email = build(input)
      assert.ok(email.subject.includes(input.ownerName), locale)
      assert.ok(email.text.includes(input.email), locale)
      assert.ok(email.html.includes(`lang="${locale}"`), locale)
      assert.ok(email.html.includes('&lt;owner &amp; {{email}}&gt;'), locale)
      assert.ok(!email.html.includes('<owner'), locale)
      assert.ok(!email.text.includes('medicine'), locale)
    }
    const verification = buildVerificationEmail('123456', locale)
    assert.ok(verification.text.includes('123456'), locale)
    assert.ok(verification.html.includes(`lang="${locale}"`), locale)
  }
})

test('translated escalation preserves medicine names, quantities, units and the authored covering message', () => {
  const reminder = {
    title: 'Medicine <name>', details: 'Before food', type: 'MEDICATION' as const,
    typeData: { medications: [{ name: 'Insulin', quantity: 10, unit: 'units' }] }, escalateEmailMessage: null
  }
  const body = notificationBody(reminder)
  for (const locale of supportedLocales) {
    assert.equal(notificationBody(reminder), body)
    assert.ok(escalationEmailText(reminder, [], locale).endsWith(`\n\n${body}`), locale)
    assert.ok(escalationEmailText(reminder, [], locale).includes(reminder.title), locale)
    assert.equal(escalationEmailText({ ...reminder, escalateEmailMessage: 'Please check {{body}}.' }, [], locale), `Please check {{body}}.\n\n${body}`)
  }
})
