/** Keep received queries, paused writes, and rollback content out of owner offline storage. */
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import type { Occurrence, OccurrenceList, Reminder } from '@persistent/shared'

/** Only reminder definitions in this query belong to the signed-in account. */
function ownedReminderIds(client: PersistedClient): Set<string> {
  const reminders = client.clientState.queries.find((query) => query.queryKey[0] === 'reminders')
  const data = reminders?.state.data
  if (!Array.isArray(data)) return new Set()
  return new Set((data as Reminder[]).map((reminder) => reminder.id))
}

/** Filter an occurrence feed to owned reminders for offline memory and storage. */
export function ownedOccurrenceData(data: unknown, ids: Set<string>): unknown {
  if (Array.isArray(data)) {
    return (data as Occurrence[]).filter((occurrence) => ids.has(occurrence.reminderId))
  }

  // History is an infinite query; keep its page cursors intact for refetching.
  if (data && typeof data === 'object' && 'pages' in data && Array.isArray(data.pages)) {
    return {
      ...data,
      pages: (data.pages as OccurrenceList[]).map((page) => ({
        ...page,
        occurrences: page.occurrences.filter((occurrence) => ids.has(occurrence.reminderId))
      }))
    }
  }

  // Unknown occurrence shapes should never become an offline access path.
  return undefined
}

const EXCLUDED_PREFIXES = new Set(['auth', 'shares', 'assignments', 'admin', 'announcements', 'promoted-apps'])

/** Collect owned targets from normal and paged occurrence feeds. */
function ownedOccurrenceIds(client: PersistedClient, ids: Set<string>): Set<string> {
  const occurrenceIds = new Set<string>()
  for (const query of client.clientState.queries) {
    if (query.queryKey[0] !== 'occurrences') continue
    const data = ownedOccurrenceData(query.state.data, ids)
    if (Array.isArray(data)) {
      for (const row of data as Occurrence[]) occurrenceIds.add(row.id)
    } else if (data && typeof data === 'object' && 'pages' in data) {
      for (const page of (data as { pages: OccurrenceList[] }).pages) {
        for (const row of page.occurrences) occurrenceIds.add(row.id)
      }
    }
  }
  return occurrenceIds
}

/** Remove revocable data from both saved queries and paused writes, also on restoration. */
export function ownedCache(client: PersistedClient): PersistedClient {
  const ids = ownedReminderIds(client)
  const occurrenceIds = ownedOccurrenceIds(client, ids)
  const mutations = client.clientState.mutations.flatMap((mutation) => {
    const [scope, operation] = mutation.mutationKey ?? []
    const variables = mutation.state.variables as { id?: string } | string | undefined
    const id = typeof variables === 'string' ? variables : variables?.id
    const context = mutation.state.context as Record<string, unknown> | undefined
    const completingOwned = scope === 'occurrences' && Array.isArray(context?.previous) &&
      context.previous.some((row: Occurrence) => row.id === id && ids.has(row.reminderId))
    const deletingOwned = scope === 'reminders' && operation === 'delete' &&
      Array.isArray(context?.previous) && context.previous.some((row: Reminder) => row.id === id)
    let allowed = false
    if (scope === 'reminders') {
      allowed = operation === 'create' || (!!id && (ids.has(id) || deletingOwned))
    } else if (scope === 'occurrences') {
      allowed = !!id && (occurrenceIds.has(id) || completingOwned)
    }
    if (!allowed) return []

    // Legacy whole-cache snapshots and current row changes must not retain
    // received projections, including when the write itself targets an owned row.
    const safeContext = context ? { ...context } : undefined
    if (safeContext) {
      delete safeContext.received
      if (scope === 'occurrences' && Array.isArray(safeContext.previous)) {
        safeContext.previous = ownedOccurrenceData(safeContext.previous, ids)
      }
      if (safeContext.checklist && typeof safeContext.checklist === 'object') {
        const checklist = safeContext.checklist as { owned?: unknown[] }
        safeContext.checklist = { owned: checklist.owned ?? [], received: [] }
      }
    }
    return [{ ...mutation, state: safeContext ? { ...mutation.state, context: safeContext } : mutation.state }]
  })
  return {
    ...client,
    clientState: {
      ...client.clientState,
      mutations,
      queries: client.clientState.queries.filter((query) => !EXCLUDED_PREFIXES.has(String(query.queryKey[0]))).map((query) => {
        if (query.queryKey[0] !== 'occurrences') return query
        return { ...query, state: { ...query.state, data: ownedOccurrenceData(query.state.data, ids) } }
      })
    }
  }
}

/** Keep the live cache intact while serializing owner queries and owner-targeted writes. */
export function serializeOwnedCache(client: PersistedClient): string {
  return JSON.stringify(ownedCache(client))
}
