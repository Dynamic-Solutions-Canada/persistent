/** Narrow the disposable server to validated sign-in and the exact synthetic escalation fixture. */
import { requestCodeSchema, verifyCodeSchema, reminderInputSchema } from '@persistent/shared'
import { FIXTURE_EMAILS } from './test-lab-accounts.mjs'

/** Apply the normal auth contract before checking the synthetic email allowlist. */
export function isCaptureSignIn(path, body) {
  if (!['/api/auth/request-code', '/api/auth/verify-code'].includes(path)) return false
  const schema = path === '/api/auth/request-code' ? requestCodeSchema : verifyCodeSchema
  const result = schema.safeParse(body)
  return result.success && FIXTURE_EMAILS.includes(result.data.email)
}

/** Permit one notification-to-alarm example, with no email escalation or unrelated reminder options. */
export function isCaptureEscalation(body) {
  const parsed = reminderInputSchema.safeParse(body)
  if (!parsed.success) return false
  const value = parsed.data
  return value.title === 'Check the oven'
    && value.details === 'Take the tray out, then turn the oven off.'
    && value.type === 'NONE' && Object.keys(value.typeData).length === 0
    && value.persistence === 'PERSISTENT' && value.schedule.kind === 'none'
    && value.escalateAfterMinutes === 1 && value.escalateAtTime === null
    && value.escalateEmail === null && value.escalateEmailMessage === null
    && value.escalateEmailAfterMinutes === null && value.soundIntervalSeconds === null
    && Object.values(value.sounds).every((sound) => sound === null)
    && value.shadeProminence === 'INHERIT' && value.active && value.endDate === null
}

/** Re-fetch only the authenticated owner's exact fixture before allowing the normal API deletion. */
export async function mayDeleteCaptureReminder(userId, id, findReminder) {
  if (!userId) return false
  const reminder = await findReminder({ where: { id, userId } })
  return isCaptureEscalation(reminder)
}
