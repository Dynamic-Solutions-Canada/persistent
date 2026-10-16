/** Date-only admin buckets retain their Toronto calendar date across browser time zones and DST. */
import { formatDate } from '../../lib/datetime.js'

/** Midday UTC stays within the named Toronto day in both standard and daylight time. */
export function growthDateLabel(date: string): string {
  return formatDate(`${date}T12:00:00Z`, 'America/Toronto')
}
