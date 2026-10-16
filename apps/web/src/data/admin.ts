/** Online-only administrator snapshot. Never persisted or replayed as an offline mutation. */
import { useQuery } from '@tanstack/react-query'
import type { AdminGrowthDays } from '@persistent/shared'
import { useAuth } from '../auth/useAuth.js'
import { adminStatsQueryOptions } from './adminStatsQuery.js'

/** Load an online admin snapshot with independent activity and calendar-day growth windows. */
export function useAdminStats(activeDays: 7 | 30, growthDays: AdminGrowthDays = 90) {
  const { user, offline } = useAuth()
  return useQuery({
    ...adminStatsQueryOptions(user?.id, activeDays, growthDays),
    enabled: Boolean(user?.isAdmin) && !offline
  })
}
