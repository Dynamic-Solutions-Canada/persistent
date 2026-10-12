/** Reminder definitions stay shared; notification placement belongs to each participant. */
import type { ShadeProminence } from '@persistent/shared'

/** Owners use their reminder setting; recipients use their own grant or device default. */
export function reminderForActor<T extends { userId: string; shadeProminence: ShadeProminence }>(
  reminder: T,
  actorId: string,
  share: { shadeProminence: ShadeProminence } | null | undefined
): T {
  if (reminder.userId === actorId) return reminder
  return { ...reminder, shadeProminence: share?.shadeProminence ?? 'INHERIT' }
}
