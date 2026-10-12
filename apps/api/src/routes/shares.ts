/**
 * Explicit reminder sharing. A share never changes ownership of the reminder or
 * its firings. Owner queries and recipient queries use separate user-scoped keys.
 */
import { Router } from 'express'
import { isTimeless, shareInputSchema, type Schedule, type SharedReminder } from '@persistent/shared'
import { prisma } from '../lib/prisma.js'
import { requireUser, requireUserId } from '../lib/auth-middleware.js'
import { badRequest, forbidden, notFound } from '../lib/http-error.js'
import { broadcast } from '../lib/realtime.js'
import { sendShareInvitationFor } from '../lib/share-invitations.js'
import { occurrenceForActor } from '../lib/recipient-alert-state.js'
import { nudgeNativeSync } from '../lib/delivery/index.js'
import { logger } from '../lib/logger.js'
import { toCheckedItemIds, toReminder } from '../lib/serializers.js'
import { expandSchedule } from '../lib/schedule-expand.js'
import type { Prisma } from '@prisma/client'

import { withSharingReminder, canManageInvitation, broadcastSharingChange } from '../lib/sharing-access.js'

export const sharesRouter = Router()
sharesRouter.use(requireUser)

/** Include the latest due firing so recipients classify one-time reminders like owners do. */
const receivedShareInclude = (now: Date) => ({
  reminder: {
    include: {
      user: { select: { email: true, displayName: true, timeZone: true } },
      occurrences: {
        where: { scheduledFor: { lte: now } },
        orderBy: { scheduledFor: 'desc' },
        take: 1
      }
    }
  }
}) satisfies Prisma.ReminderShareInclude

/** Remember an address after a grant or invitation is stored, even if later removed. */
async function rememberRecipient(database: Prisma.TransactionClient, ownerId: string, email: string): Promise<void> {
  await database.shareRecipient.upsert({
    where: { ownerId_email: { ownerId, email } },
    create: { ownerId, email },
    update: { lastSharedAt: new Date() }
  })
}

/** Project canonical reminder data with the recipient's personal display preference. */
function toSharedReminder(
  share: Prisma.ReminderShareGetPayload<{ include: ReturnType<typeof receivedShareInclude> }>,
  firings: SharedReminder['activeFirings'],
  now: Date
): SharedReminder {
  const { reminder } = share
  const schedule = reminder.schedule as unknown as Schedule
  const nextScheduledFor = reminder.active && !isTimeless(schedule.kind)
    ? expandSchedule({
        schedule,
        startDate: reminder.startDate,
        endDate: reminder.endDate,
        timeZone: reminder.user.timeZone,
        from: now,
        to: new Date(now.getTime() + 366 * 24 * 60 * 60_000),
        maxResults: 1
      })[0]?.toISOString() ?? null
    : null
  return {
    id: reminder.id,
    title: reminder.title,
    details: reminder.details,
    type: reminder.type,
    typeData: reminder.typeData as SharedReminder['typeData'],
    checkedItemIds: toCheckedItemIds(reminder.checkedItems),
    isNote: (reminder.schedule as { kind?: string }).kind === 'never',
    active: reminder.active,
    ownerName: reminder.user.displayName || reminder.user.email,
    ownerTimeZone: reminder.user.timeZone,
    nextScheduledFor,
    permission: 'EDIT',
    activeFirings: firings,
    editableReminder: {
      ...toReminder(reminder, reminder.occurrences[0] ?? null),
      shadeProminence: share.shadeProminence
    },
    updatedAt: reminder.updatedAt.toISOString()
  }
}

sharesRouter.get('/received', async (request, response) => {
  const recipientId = requireUserId(request)
  const now = new Date()
  const shares = await prisma.reminderShare.findMany({
    where: { recipientId },
    include: receivedShareInclude(now),
    orderBy: { createdAt: 'desc' }
  })
  const firings = await prisma.reminderOccurrence.findMany({
    where: {
      reminderId: { in: shares.map((share) => share.reminderId) },
      reminder: { shares: { some: { recipientId } } },
      status: { in: ['FIRED', 'ESCALATED', 'SNOOZED'] }
    },
    include: { recipientAlerts: { where: { recipientId } } }
  })
  response.json({
    reminders: shares.map((share) => toSharedReminder(
      share,
      firings.filter((firing) => firing.reminderId === share.reminderId).map((firing) => {
        const personal = occurrenceForActor(firing, recipientId, firing.recipientAlerts[0])
        return {
          id: personal.id,
          status: personal.status,
          scheduledFor: personal.scheduledFor.toISOString(),
          snoozedUntil: personal.snoozedUntil?.toISOString() ?? null,
          checkedItemIds: toCheckedItemIds(personal.checkedItems)
        }
      }),
      now
    ))
  })
})

sharesRouter.get('/recipients', async (request, response) => {
  const ownerId = requireUserId(request)
  const recipients = await prisma.shareRecipient.findMany({
    where: { ownerId },
    orderBy: { lastSharedAt: 'desc' },
    take: 20,
    select: { email: true }
  })
  response.json({ recipients: recipients.map((recipient) => recipient.email) })
})

/** Leaving removes only the caller's grant; the owner's reminder and firings survive. */
sharesRouter.delete('/received/:reminderId', async (request, response) => {
  const recipientId = requireUserId(request)
  const reminder = await withSharingReminder(request.params.reminderId, recipientId, async (transaction, reminder) => {
    const deleted = await transaction.reminderShare.deleteMany({ where: { reminderId: reminder.id, recipientId } })
    if (deleted.count === 0) throw notFound('Shared reminder not found.')
    await transaction.recipientAlertState.deleteMany({
      where: { recipientId, occurrence: { reminderId: reminder.id } }
    })
    return reminder
  })
  await broadcastSharingChange(reminder.id, reminder.userId, recipientId)
  broadcast(recipientId, { type: 'reminder.changed', reminderId: reminder.id })
  void nudgeNativeSync(recipientId).catch((error) =>
    logger.warn('leave shared reminder sync failed', { error: String(error), reminderId: reminder.id })
  )
  response.json({ ok: true })
})

sharesRouter.get('/:reminderId', async (request, response) => {
  const userId = requireUserId(request)
  const roster = await withSharingReminder(request.params.reminderId, userId, async (transaction, reminder) => {
    const shares = await transaction.reminderShare.findMany({
      where: { reminderId: reminder.id, reminder: { userId: reminder.userId } },
      include: { recipient: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: 'asc' }
    })
    const invitations = await transaction.reminderInvitation.findMany({
      where: { reminderId: reminder.id, reminder: { userId: reminder.userId } },
      orderBy: { createdAt: 'asc' }
    })
    return {
      owner: reminder.user,
      shares: [...shares.map((share) => ({
        recipientId: share.recipientId,
        email: share.recipient.email,
        displayName: share.recipient.displayName,
        permission: 'EDIT',
        pending: false,
        canRemove: canManageInvitation(reminder.userId, share.invitedById, userId)
      })), ...invitations.map((invitation) => ({
        recipientId: null,
        email: invitation.email,
        displayName: null,
        permission: 'EDIT',
        pending: true,
        canRemove: canManageInvitation(reminder.userId, invitation.invitedById, userId)
      }))]
    }
  })
  response.json(roster)
})

sharesRouter.put('/:reminderId', async (request, response) => {
  const userId = requireUserId(request)
  const parsed = shareInputSchema.safeParse(request.body)
  if (!parsed.success) throw badRequest('Enter a valid email and access level.')

  const result = await withSharingReminder(request.params.reminderId, userId, async (transaction, reminder) => {
    if (await transaction.reminderAssignment.findUnique({ where: { reminderId: reminder.id } })) {
      throw badRequest('Assigned reminders can have only one recipient.')
    }

    // Google may have stored the account's original email casing; addresses are
    // matched case-insensitively just like the sign-in field presented to people.
    const recipient = await transaction.user.findFirst({
      where: { email: { equals: parsed.data.email, mode: 'insensitive' } }
    })
    if (parsed.data.email === reminder.user.email.toLowerCase()) {
      throw badRequest('The owner already has access.')
    }
    if (recipient?.id === userId) throw badRequest('You already have access.')

    if (!recipient) {
      const existing = await transaction.reminderInvitation.findUnique({
        where: { reminderId_email: { reminderId: reminder.id, email: parsed.data.email } }
      })
      if (existing && !canManageInvitation(reminder.userId, existing.invitedById, userId)) {
        throw forbidden('Only the owner or inviter can resend this invitation.')
      }
      if (!existing) {
        const count = await transaction.reminderShare.count({ where: { reminderId: reminder.id } }) +
          await transaction.reminderInvitation.count({ where: { reminderId: reminder.id } })
        if (count >= 20) throw badRequest('You can share with up to 20 people.')
      }
      await transaction.reminderInvitation.upsert({
        where: { reminderId_email: { reminderId: reminder.id, email: parsed.data.email } },
        create: { reminderId: reminder.id, email: parsed.data.email, invitedById: userId, permission: 'EDIT' },
        update: { permission: 'EDIT' }
      })
      await rememberRecipient(transaction, userId, parsed.data.email)
      return { reminder, share: { recipientId: null, email: parsed.data.email, displayName: null, permission: 'EDIT' as const, pending: true } }

    }

    const current = await transaction.reminderShare.findUnique({
      where: { reminderId_recipientId: { reminderId: reminder.id, recipientId: recipient.id } }
    })
    // An account may have registered while its email invitation is still being claimed.
    // Preserve that invitation's author instead of awarding removal rights to a later add.
    const pendingInvitation = await transaction.reminderInvitation.findUnique({
      where: { reminderId_email: { reminderId: reminder.id, email: parsed.data.email } }
    })
    const invitedById = pendingInvitation ? pendingInvitation.invitedById : userId
    if (!current && !pendingInvitation) {
      const count = await transaction.reminderShare.count({ where: { reminderId: reminder.id } }) +
        await transaction.reminderInvitation.count({ where: { reminderId: reminder.id } })
      if (count >= 20) throw badRequest('You can share with up to 20 people.')
    }

    const share = await transaction.reminderShare.upsert({
      where: { reminderId_recipientId: { reminderId: reminder.id, recipientId: recipient.id } },
      create: { reminderId: reminder.id, recipientId: recipient.id, invitedById, permission: 'EDIT' },
      update: { permission: 'EDIT' }
    })
    await rememberRecipient(transaction, userId, parsed.data.email)
    await transaction.reminderInvitation.deleteMany({ where: { reminderId: reminder.id, email: parsed.data.email } })
    return { reminder, share: { recipientId: share.recipientId, email: recipient.email, displayName: recipient.displayName, permission: 'EDIT' as const, pending: false } }
  })

  // Persist and invalidate before delivery: a mail failure leaves a retryable invitation.
  await broadcastSharingChange(result.reminder.id, result.reminder.userId)
  if (result.share.recipientId) {
    broadcast(result.share.recipientId, { type: 'reminder.changed', reminderId: result.reminder.id })
    void nudgeNativeSync(result.share.recipientId).catch((error) =>
      logger.warn('new share sync failed', { error: String(error), reminderId: result.reminder.id })
    )
  } else {
    await deliverInvitation(userId, result.reminder.id, result.share.email)
  }
  response.json({ share: result.share })
})

sharesRouter.delete('/:reminderId/invitations/:email', async (request, response) => {
  const userId = requireUserId(request)
  const reminder = await withSharingReminder(request.params.reminderId, userId, async (transaction, reminder) => {
    const deleted = await transaction.reminderInvitation.deleteMany({
      where: {
        reminderId: reminder.id, email: request.params.email.toLowerCase(),
        reminder: { userId: reminder.userId },
        ...(reminder.userId === userId ? {} : { invitedById: userId })
      }
    })
    if (deleted.count === 0) throw notFound('Invitation not found.')
    return reminder
  })
  await broadcastSharingChange(reminder.id, reminder.userId)
  response.json({ ok: true })
})

sharesRouter.post('/:reminderId/invitations/:email/resend', async (request, response) => {
  const userId = requireUserId(request)
  const invitation = await withSharingReminder(request.params.reminderId, userId, async (transaction, reminder) => {
    const invitation = await transaction.reminderInvitation.findFirst({
      where: {
        reminderId: reminder.id,
        email: request.params.email.toLowerCase(),
        reminder: { userId: reminder.userId },
        ...(reminder.userId === userId ? {} : { invitedById: userId })
      }
    })
    if (!invitation) throw notFound('Invitation not found.')
    return invitation
  })
  await deliverInvitation(userId, invitation.reminderId, invitation.email)
  response.json({ ok: true })
})

sharesRouter.delete('/:reminderId/:recipientId', async (request, response) => {
  const userId = requireUserId(request)
  const reminder = await withSharingReminder(request.params.reminderId, userId, async (transaction, reminder) => {
    const deleted = await transaction.reminderShare.deleteMany({
      where: {
        reminderId: reminder.id, recipientId: request.params.recipientId,
        reminder: { userId: reminder.userId },
        ...(reminder.userId === userId ? {} : { invitedById: userId })
      }
    })
    if (deleted.count === 0) throw notFound('Share not found.')
    await transaction.recipientAlertState.deleteMany({
      where: { recipientId: request.params.recipientId, occurrence: { reminderId: reminder.id } }
    })
    return reminder
  })
  await broadcastSharingChange(reminder.id, reminder.userId, request.params.recipientId)
  broadcast(request.params.recipientId, { type: 'reminder.changed', reminderId: reminder.id })
  void nudgeNativeSync(request.params.recipientId).catch((error) =>
    logger.warn('removed share sync failed', { error: String(error), reminderId: reminder.id })
  )
  response.json({ ok: true })
})

/** Log retryable email failures without recipient addresses or message contents. */
async function deliverInvitation(actorId: string, reminderId: string, email: string): Promise<void> {
  try {
    await sendShareInvitationFor(actorId, email)
  } catch (error) {
    logger.warn('share invitation delivery failed', { actorId, reminderId, error: String(error) })
    throw error
  }
}
