/** Invalidate the creator's read-only progress view after an assignee acts. */
import { prisma } from './prisma.js'
import { broadcast } from './realtime.js'

export async function broadcastAssignmentProgress(reminderId: string): Promise<void> {
  const assignment = await prisma.reminderAssignment.findUnique({
    where: { reminderId },
    select: { id: true, creatorId: true, recipientId: true }
  })
  if (!assignment?.recipientId) return
  const latestDone = await prisma.reminderOccurrence.findFirst({
    where: { reminderId, userId: assignment.recipientId, status: 'ACKNOWLEDGED', acknowledgedAt: { not: null } },
    orderBy: { acknowledgedAt: 'desc' },
    select: { acknowledgedAt: true }
  })
  // Undo can remove the latest (or only) completion from the progress record.
  await prisma.reminderAssignment.update({
    where: { id: assignment.id, creatorId: assignment.creatorId },
    data: { lastCompletedAt: latestDone?.acknowledgedAt ?? null }
  })
  broadcast(assignment.creatorId, { type: 'assignment.changed' })
}
