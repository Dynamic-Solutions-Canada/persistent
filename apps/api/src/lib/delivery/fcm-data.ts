/** Lossless FCM presentation metadata: one copy of literal content for old and new Android hosts. */
import { catalogFor, message, normalizeLocaleOverride, type PushPayload } from '@persistent/shared'

/**
 * Serialize one device's data payload. Escalation ranges use JS/Kotlin UTF-16
 * indexes, so astral characters and translation-like user content round-trip.
 * This does not change the existing policy for independently oversized messages.
 */
export function fcmData(payload: PushPayload, deviceLocale: unknown): Record<string, string> {
  const locale = normalizeLocaleOverride(deviceLocale) ?? 'en-US'
  const { baseBody, bodyRange: _range, ...legacy } = payload
  const localized = { ...legacy, locale } as PushPayload

  if (payload.type === 'escalate') {
    const literal = baseBody ?? payload.body ?? ''
    const template = catalogFor(locale)['{{body}} (escalated)'] ?? '{{body}} (escalated)'
    const marker = '{{body}}'
    const start = template.indexOf(marker)
    // Bundled catalog tests enforce exactly one placeholder. Reject a broken
    // package rather than attach a range that could reinterpret literal content.
    if (start < 0 || template.indexOf(marker, start + marker.length) >= 0) {
      throw new Error('Invalid bundled escalation template')
    }
    localized.body = literal
      ? template.slice(0, start) + literal + template.slice(start + marker.length)
      : message(locale, 'Escalated')
    localized.bodyRange = literal ? `${start}:${literal.length}` : '0:0'
  }

  return Object.fromEntries(Object.entries(localized)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)]))
}
