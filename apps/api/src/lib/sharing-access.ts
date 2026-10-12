/** Membership management requires an explicit current grant; ownership never transfers. */
import type { Prisma } from '@prisma/client'
import { notFound } from './http-error.js'
import { prisma } from './prisma.js'
import { broadcast } from './realtime.js'
import { participantIds } from './share-access.js'

/** Read a sharing roster or invite someone only through ownership or a current share. */
export async function sharingReminder(id: string, actorId: string, database: Prisma.TransactionClient = prisma) {
  return database.reminder.findFirst({
    where: {
      id,
      OR: [{ userId: actorId }, { shares: { some: { recipientId: actorId } } }]
    },
    include: { user: { select: { id: true, email: true, displayName: true } } }
  })
}

/** Only the owner or original inviter may remove access, never by re-adding an existing member. */
export function canManageInvitation(ownerId: string, invitedById: string | null, actorId: string): boolean {
  return actorId === ownerId || actorId === invitedById
}

/** Refresh every member's roster, including a member whose access was just removed. */
export async function broadcastSharingChange(reminderId: string, ownerId: string, removedId?: string): Promise<void> {
  const members = await participantIds(reminderId, ownerId)
  for (const memberId of new Set([...members, ...(removedId ? [removedId] : [])])) {
    broadcast(memberId, { type: 'share.changed' })
  }
}

/** Serialize membership changes on the canonical definition, then recheck the grant.
 * A lock waiter must not authorize from the snapshot taken before revocation committed.
 */
export async function lockSharingReminder(transaction: Prisma.TransactionClient, id: string, actorId: string) {
  const locked = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT r.id FROM "Reminder" r
    WHERE r.id = ${id} AND (r."userId" = ${actorId} OR EXISTS (
      SELECT 1 FROM "ReminderShare" s WHERE s."reminderId" = r.id AND s."recipientId" = ${actorId}
    )) FOR UPDATE OF r
  `
  if (locked.length === 0) throw notFound('Reminder not found.')
  const reminder = await sharingReminder(id, actorId, transaction)
  if (!reminder) throw notFound('Reminder not found.')
  return reminder
}

/** Run authorized roster reads and membership writes under the same parent lock. */
export async function withSharingReminder<T>(
  id: string,
  actorId: string,
  action: (transaction: Prisma.TransactionClient, reminder: NonNullable<Awaited<ReturnType<typeof sharingReminder>>>) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (transaction) => {
    const reminder = await lockSharingReminder(transaction, id, actorId)
    return action(transaction, reminder)
  })
}
