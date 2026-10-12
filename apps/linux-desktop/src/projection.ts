/** Select due notifications from the shared server projection, without expanding schedules. */
import { deviceAlarmSchema, ESC_SUFFIX, type DeviceAlarm } from '@persistent/shared'

export type PresentedAlarm = DeviceAlarm & { escalated: boolean }

/** Reject malformed snapshots as a whole: an invalid response must never clear live notifications. */
export function activeProjection(value: unknown): Map<string, PresentedAlarm> {
  if (typeof value !== 'object' || value === null) throw new Error('Missing alarm projection')
  const raw = value as { serverTime?: unknown; alarms?: unknown }
  if (typeof raw.serverTime !== 'string' || !Number.isFinite(Date.parse(raw.serverTime))) {
    throw new Error('Missing server time')
  }
  const now = Date.parse(raw.serverTime)
  const alarms = deviceAlarmSchema.array().parse(raw.alarms)
  const result = new Map<string, PresentedAlarm>()
  for (const alarm of alarms) {
    if (!Number.isFinite(alarm.fireAtMs) || !Number.isFinite(alarm.soundIntervalSeconds) || alarm.soundIntervalSeconds < 0) throw new Error('Invalid alarm projection numbers')
    if (alarm.fireAtMs > now) continue
    if (!alarm.occurrenceId || !alarm.reminderId || !alarm.title) throw new Error('Invalid alarm identifiers')
    const escalated = alarm.occurrenceId.endsWith(ESC_SUFFIX)
    const id = escalated ? alarm.occurrenceId.slice(0, -ESC_SUFFIX.length) : alarm.occurrenceId
    // Escalation wins even when a response reorders the base and its twin.
    if (result.get(id)?.escalated && !escalated) continue
    result.set(id, { ...alarm, occurrenceId: id, alarm: escalated || alarm.alarm, canSilence: escalated || alarm.canSilence, escalated })
  }
  return result
}
