/** Optimistic checklist writes across owned and live received-share projections. */
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { Occurrence, Reminder, SharedReminder } from '@persistent/shared'

export interface ChecklistSnapshot<T extends Reminder | Occurrence = Reminder | Occurrence> {
  previous?: T[]
  checklist?: { owned: RowChange<T>[]; received: RowChange<SharedReminder>[] }
}

/** Update an item idempotently without replacing other participants' progress. */
export function checkedItems(ids: readonly string[], itemId: string, checked: boolean): string[] {
  const remaining = ids.filter((id) => id !== itemId)
  return checked ? [...remaining, itemId] : remaining
}

/** Apply a definition change to both recipient projections, preserving grant and firing data. */
export function updateSharedReminder(share: SharedReminder, update: (reminder: Reminder) => Reminder): SharedReminder {
  if (!share.editableReminder) return share
  const reminder = update(share.editableReminder)
  return {
    ...share,
    title: reminder.title,
    details: reminder.details,
    typeData: reminder.typeData,
    checkedItemIds: reminder.checkedItemIds,
    editableReminder: reminder
  }
}

interface RowChange<T> {
  id: string
  before: T
  after: T
}

/** Record only changed rows; unrelated shared content never enters a mutation context. */
function updateRows<T extends { id: string }>(client: QueryClient, key: QueryKey, update: (row: T) => T): RowChange<T>[] {
  const changes: RowChange<T>[] = []
  client.setQueryData<T[]>(key, (rows) => rows?.map((before) => {
    const after = update(before)
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ id: before.id, before, after })
    return after
  }))
  return changes
}

/** Cancel pending reads before applying changes to existing owner and recipient rows. */
export async function optimisticChecklistChange<T extends Reminder | Occurrence>(
  client: QueryClient,
  ownedKey: QueryKey,
  receivedKey: QueryKey,
  updateOwned: (row: T) => T,
  updateReceived: (share: SharedReminder) => SharedReminder
): Promise<ChecklistSnapshot<T>> {
  await Promise.all([
    client.cancelQueries({ queryKey: ownedKey }),
    client.cancelQueries({ queryKey: receivedKey })
  ])
  return {
    checklist: {
      owned: updateRows(client, ownedKey, updateOwned),
      received: updateRows(client, receivedKey, updateReceived)
    }
  }
}

/** Roll back only a still-current optimistic row. Never resurrect revoked/missing data
 * or overwrite a newer write/refetch. Settled invalidation reconciles overlapping edits.
 */
export function rollbackChecklistChange<T extends Reminder | Occurrence>(
  client: QueryClient, ownedKey: QueryKey, receivedKey: QueryKey, snapshot: ChecklistSnapshot<T>
): void {
  function rollback<R extends { id: string }>(key: QueryKey, changes: RowChange<R>[]): void {
    client.setQueryData<R[]>(key, (rows) => rows?.map((row) => {
      const change = changes.find((candidate) => candidate.id === row.id)
      return change && JSON.stringify(row) === JSON.stringify(change.after) ? change.before : row
    }))
  }
  if (!snapshot.checklist) return
  rollback(ownedKey, snapshot.checklist.owned)
  rollback(receivedKey, snapshot.checklist.received)
}
