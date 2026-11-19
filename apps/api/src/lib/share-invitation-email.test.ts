import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAssignmentInvitationEmail,
  buildShareInvitationEmail,
} from './share-invitation-email.js'

test('invitation email is readable and does not render sender HTML', () => {
  const email = buildShareInvitationEmail({
    ownerName: '<Alex & team>',
    email: 'friend@example.com',
    appUrl: 'https://persistent.example',
  })

  assert.match(email.subject, /invited you/)
  assert.match(email.text, /friend@example.com/)
  assert.match(email.html, /&lt;Alex &amp; team&gt;/)
  assert.doesNotMatch(email.html, /<Alex & team>/)
  assert.match(email.html, /href="https:\/\/persistent\.example"/)
  assert.match(email.html, /ignore this email/)
})

test('assignment invitation keeps reminder details private before sign-in', () => {
  const email = buildAssignmentInvitationEmail({
    ownerName: '<Alex & team>',
    email: 'friend@example.com',
    appUrl: 'https://persistent.example',
  })

  assert.match(email.subject, /reminder for you/)
  assert.match(email.html, /&lt;Alex &amp; team&gt;/)
  assert.match(email.text, /friend@example.com/)
  assert.doesNotMatch(email.html, /<Alex & team>/)
})
