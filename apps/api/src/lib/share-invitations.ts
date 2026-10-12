/** Email invitations and verified-account claiming for reminder sharing. */
import { prisma } from './prisma.js'
import { clientOrigins } from './env.js'
import { isEmailConfigured, sendCloudflareEmail } from './cloudflare-email.js'
import { HttpError, tooManyRequests } from './http-error.js'
import { broadcast } from './realtime.js'
import { rateLimit } from './rate-limit.js'
import { buildShareInvitationEmail } from './share-invitation-email.js'
import { nudgeNativeSync } from './delivery/index.js'
import { broadcastSharingChange } from './sharing-access.js'
import { logger } from './logger.js'

/** Invite an unregistered recipient without exposing reminder details in email. */
export async function sendShareInvitation(input: {
  ownerId: string
  email: string
  ownerName: string
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new HttpError(503, 'Email invitations are unavailable right now.')
  }
  if (!rateLimit(`share-invite:${input.ownerId}:${input.email}`, 5, 24 * 60 * 60_000) ||
      !rateLimit(`share-invite-owner:${input.ownerId}`, 30, 24 * 60 * 60_000)) {
    throw tooManyRequests('Too many invitations sent. Try again later.')
  }

  const appUrl = clientOrigins[0]?.replace(/\/$/, '') ?? 'https://persistent.app'
  await sendCloudflareEmail({
    to: input.email,
    ...buildShareInvitationEmail({ ownerName: input.ownerName, email: input.email, appUrl })
  })
}

/** Attribute an invitation email to the authenticated person actually sending it. */
export async function sendShareInvitationFor(actorId: string, email: string): Promise<void> {
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: actorId },
    select: { email: true, displayName: true }
  })
  await sendShareInvitation({
    ownerId: actorId,
    email,
    ownerName: actor.displayName || actor.email
  })
}

/** Convert pending grants only after sign-in verifies ownership of the address. */
export async function claimShareInvitations(user: { id: string; email: string }): Promise<void> {
  const claimed = await prisma.$transaction(async (transaction) => {
    const invitations = await transaction.reminderInvitation.findMany({
      where: { email: { equals: user.email, mode: 'insensitive' } },
      include: { reminder: { select: { userId: true } } },
      orderBy: { reminderId: 'asc' }
    })
    const claimedReminderIds: string[] = []
    for (const invitation of invitations) {
      // Use the same parent lock as add/remove. Re-read after waiting so a
      // revoked invitation cannot be claimed and its original author is current.
      await transaction.$queryRaw`
        SELECT id FROM "Reminder" WHERE id = ${invitation.reminderId}
        AND "userId" = ${invitation.reminder.userId} FOR UPDATE
      `
      const current = await transaction.reminderInvitation.findUnique({
        where: { reminderId_email: { reminderId: invitation.reminderId, email: invitation.email } }
      })
      if (!current) continue
      await transaction.reminderInvitation.delete({ where: { reminderId_email: { reminderId: current.reminderId, email: current.email } } })
      if (invitation.reminder.userId !== user.id) {
        await transaction.reminderShare.upsert({
          where: { reminderId_recipientId: { reminderId: invitation.reminderId, recipientId: user.id } },
          create: { reminderId: invitation.reminderId, recipientId: user.id, invitedById: current.invitedById, permission: 'EDIT' },
          update: { permission: 'EDIT' }
        })
        claimedReminderIds.push(invitation.reminderId)
      }
    }
    return claimedReminderIds
  })
  if (claimed.length > 0) {
    broadcast(user.id, { type: 'share.changed' })
    for (const reminderId of claimed) {
      const reminder = await prisma.reminder.findFirst({
        where: { id: reminderId, shares: { some: { recipientId: user.id } } },
        select: { userId: true }
      })
      if (reminder) await broadcastSharingChange(reminderId, reminder.userId)
      broadcast(user.id, { type: 'reminder.changed', reminderId })
    }
    void nudgeNativeSync(user.id).catch((error) =>
      logger.warn('claimed invitation sync failed', { error: String(error), userId: user.id })
    )
  }
}
