/** Admin snapshot query options preserve layout during period changes without crossing accounts. */
import { queryOptions } from '@tanstack/react-query'
import { adminStatsSchema, type AdminGrowthDays } from '@persistent/shared'
import { apiFetch } from '../lib/apiClient.js'

/** Carry prior period data only within one account; errors discard the placeholder. */
export function adminStatsQueryOptions(userId: string | undefined, activeDays: 7 | 30, growthDays: AdminGrowthDays) {
  return queryOptions({
    queryKey: ['admin', userId, 'stats', activeDays, growthDays] as const,
    queryFn: async ({ signal }) => adminStatsSchema.parse(await apiFetch(`/api/admin/stats?activeDays=${activeDays}&growthDays=${growthDays}`, { signal })),
    // Do not collapse the dashboard while fetching a different period. The page
    // still hides data offline, on authorization errors or after loss of the role.
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === userId ? previous : undefined,
    retry: false,
    gcTime: 0,
    staleTime: 0
  })
}
