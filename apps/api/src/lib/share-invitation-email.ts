/** Private invitation copy. Reminder titles and medical details never enter these emails. */
import { message, type Locale } from '@persistent/shared'

interface InvitationInput {
  ownerName: string
  email: string
  appUrl: string
  locale?: Locale
}

/** Escape only after interpolation, including names and addresses supplied by a user. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] ?? character)
}

/** Keep reminder titles out of email; the recipient sees them after verification. */
export function buildShareInvitationEmail(input: InvitationInput) {
  return buildInvitationEmail(input, 'shared')
}

/** Assignment invitations use the same private, accessible layout as sharing. */
export function buildAssignmentInvitationEmail(input: InvitationInput) {
  return buildInvitationEmail(input, 'assigned')
}

/** Translate whole sentences so languages can place the sender and action naturally. */
function buildInvitationEmail(input: InvitationInput, kind: 'shared' | 'assigned') {
  const locale = input.locale ?? 'en-US'
  const subject = message(locale, kind === 'assigned'
    ? '{{owner}} created a reminder for you on Persistent'
    : '{{owner}} invited you to a shared reminder on Persistent', { owner: input.ownerName })
  const heading = message(locale, kind === 'assigned'
    ? 'A reminder has been created for you'
    : 'You have been invited to a reminder')
  const signup = message(locale, 'Sign up with {{email}} to see it: {{url}}', { email: input.email, url: input.appUrl })
  const create = message(locale, 'Create your free Persistent account with this email address to see it.')
  const ignore = message(locale, 'If you were not expecting this invitation, you can ignore this email.')
  const open = message(locale, 'Open Persistent')

  return {
    subject,
    text: `${subject}.\n\n${signup}\n\n${ignore}`,
    html: `<!doctype html>
<html lang="${locale}"><body style="margin:0;padding:32px 16px;background:#f5f7fa;font-family:Arial,sans-serif;color:#172033">
  <table role="presentation" style="max-width:560px;width:100%;margin:auto;background:#fff;border:1px solid #e2e7ee;border-radius:12px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 24px;color:#087f68;font-size:15px;font-weight:700">Persistent</p>
      <h1 style="margin:0 0 16px;font-size:25px;line-height:1.3">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 18px;line-height:1.6">${escapeHtml(subject)}.</p>
      <p style="margin:0 0 28px;line-height:1.6">${escapeHtml(create)}</p>
      <a href="${escapeHtml(input.appUrl)}" style="display:inline-block;padding:13px 22px;background:#087f68;border-radius:7px;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(open)}</a>
      <p style="margin:28px 0 0;color:#647082;font-size:13px;line-height:1.5">${escapeHtml(ignore)}</p>
    </td></tr>
  </table>
</body></html>`
  }
}
