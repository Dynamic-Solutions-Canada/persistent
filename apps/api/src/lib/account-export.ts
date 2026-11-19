/**
 * Builds the "download my data" file (SEC-13): the `AccountExport` shape from
 * `@persistent/shared`, for one account.
 *
 * Every query is scoped to the account's own id, through the same ownership rules the app
 * uses: owned rows by `userId`, shares received by `recipientId`, assignments by `creatorId`
 * or `recipientId`. Reminders shared with the user contribute only their title, their owner's
 * address and the user's own alert state, which the app already shows them. Secrets are never
 * selected, so they cannot leak through a later serializer change.
 */
import type { AccountExport } from '@persistent/shared'
import { prisma } from './prisma.js'
import { notFound } from './http-error.js'

/** ISO-8601 for a nullable timestamp column. */
function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null
}

/**
 * Reads everything the account owns, in one consistent snapshot.
 *
 * @param userId the authenticated account, from `requireUserId`.
 * @param now the export time recorded in the file.
 * @throws 404 when the account no longer exists.
 */
export async function buildAccountExport(
  userId: string,
  now = new Date(),
): Promise<AccountExport> {
  // A repeatable-read transaction keeps a reminder and its firings from disagreeing when a
  // scheduler tick or another device writes mid-export.
  const rows = await prisma.$transaction(
    async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          displayName: true,
          timeZone: true,
          emailLanguage: true,
          createdAt: true,
        },
      })
      if (!user) throw notFound('Account not found.')

      const reminders = await transaction.reminder.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: {
          occurrences: {
            where: { userId },
            orderBy: { scheduledFor: 'asc' },
          },
          shares: {
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true, recipient: { select: { email: true } } },
          },
          invitations: {
            orderBy: { createdAt: 'asc' },
            select: { email: true, createdAt: true },
          },
        },
      })

      const sharedWithMe = await transaction.reminderShare.findMany({
        where: { recipientId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          reminderId: true,
          createdAt: true,
          shadeProminence: true,
          reminder: {
            select: { title: true, user: { select: { email: true } } },
          },
        },
      })

      const alerts = await transaction.recipientAlertState.findMany({
        where: { recipientId: userId },
        select: {
          snoozedUntil: true,
          escalatedAt: true,
          escalationSilencedAt: true,
          occurrence: { select: { reminderId: true, scheduledFor: true } },
        },
      })

      const recentRecipients = await transaction.shareRecipient.findMany({
        where: { ownerId: userId },
        orderBy: { lastSharedAt: 'desc' },
        select: { email: true, lastSharedAt: true },
      })

      const assignmentsCreated = await transaction.reminderAssignment.findMany({
        where: { creatorId: userId },
        orderBy: { createdAt: 'asc' },
      })

      const assignmentsReceived = await transaction.reminderAssignment.findMany(
        {
          where: { recipientId: userId },
          orderBy: { createdAt: 'asc' },
          include: { creator: { select: { email: true } } },
        },
      )

      const passkeys = await transaction.passkey.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          name: true,
          backedUp: true,
          createdAt: true,
          lastUsedAt: true,
        },
      })

      const sessions = await transaction.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          clientApp: true,
          clientPlatform: true,
          userAgent: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      })

      const pushRegistrations = await transaction.pushSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { kind: true, locale: true, userAgent: true, createdAt: true },
      })

      const dismissed = await transaction.announcementView.findMany({
        where: { userId },
        orderBy: { viewedAt: 'asc' },
      })

      return {
        user,
        reminders,
        sharedWithMe,
        alerts,
        recentRecipients,
        assignmentsCreated,
        assignmentsReceived,
        passkeys,
        sessions,
        pushRegistrations,
        dismissed,
      }
    },
    { isolationLevel: 'RepeatableRead' },
  )

  return {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    account: {
      ...rows.user,
      createdAt: rows.user.createdAt.toISOString(),
    },
    reminders: rows.reminders.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      details: reminder.details,
      type: reminder.type,
      typeData: reminder.typeData,
      schedule: reminder.schedule,
      checkedItems: reminder.checkedItems,
      hideCheckedItems: reminder.hideCheckedItems,
      persistence: reminder.persistence,
      soundIntervalSeconds: reminder.soundIntervalSeconds,
      sounds: reminder.sounds,
      shadeProminence: reminder.shadeProminence,
      escalateAfterMinutes: reminder.escalateAfterMinutes,
      escalateAtTime: reminder.escalateAtTime,
      escalateEmail: reminder.escalateEmail,
      escalateEmailMessage: reminder.escalateEmailMessage,
      escalateEmailAfterMinutes: reminder.escalateEmailAfterMinutes,
      active: reminder.active,
      startDate: reminder.startDate,
      endDate: reminder.endDate,
      createdAt: reminder.createdAt.toISOString(),
      updatedAt: reminder.updatedAt.toISOString(),
      sharedWith: reminder.shares.map((share) => ({
        email: share.recipient.email,
        sharedAt: share.createdAt.toISOString(),
      })),
      pendingInvitations: reminder.invitations.map((invitation) => ({
        email: invitation.email,
        invitedAt: invitation.createdAt.toISOString(),
      })),
      occurrences: reminder.occurrences.map((occurrence) => ({
        scheduledFor: occurrence.scheduledFor.toISOString(),
        status: occurrence.status,
        firedAt: iso(occurrence.firedAt),
        acknowledgedAt: iso(occurrence.acknowledgedAt),
        snoozedUntil: iso(occurrence.snoozedUntil),
        escalatedAt: iso(occurrence.escalatedAt),
        escalationSilencedAt: iso(occurrence.escalationSilencedAt),
        escalationEmailedAt: iso(occurrence.escalationEmailedAt),
        supersededAt: iso(occurrence.supersededAt),
        checkedItems: occurrence.checkedItems,
      })),
    })),
    sharing: {
      sharedWithMe: rows.sharedWithMe.map((share) => ({
        reminderId: share.reminderId,
        title: share.reminder.title,
        ownerEmail: share.reminder.user.email,
        sharedAt: share.createdAt.toISOString(),
        shadeProminence: share.shadeProminence,
        alerts: rows.alerts
          .filter((alert) => alert.occurrence.reminderId === share.reminderId)
          .map((alert) => ({
            scheduledFor: alert.occurrence.scheduledFor.toISOString(),
            snoozedUntil: iso(alert.snoozedUntil),
            escalatedAt: iso(alert.escalatedAt),
            escalationSilencedAt: iso(alert.escalationSilencedAt),
          })),
      })),
      recentRecipients: rows.recentRecipients.map((recipient) => ({
        email: recipient.email,
        lastSharedAt: recipient.lastSharedAt.toISOString(),
      })),
    },
    assignments: {
      created: rows.assignmentsCreated.map((assignment) => ({
        title: assignment.title,
        otherEmail: assignment.recipientEmail,
        state: assignment.state,
        createdAt: assignment.createdAt.toISOString(),
        acceptedAt: iso(assignment.acceptedAt),
        declinedAt: iso(assignment.declinedAt),
        lastCompletedAt: iso(assignment.lastCompletedAt),
      })),
      received: rows.assignmentsReceived.map((assignment) => ({
        title: assignment.title,
        otherEmail: assignment.creator.email,
        state: assignment.state,
        createdAt: assignment.createdAt.toISOString(),
        acceptedAt: iso(assignment.acceptedAt),
        declinedAt: iso(assignment.declinedAt),
        lastCompletedAt: iso(assignment.lastCompletedAt),
      })),
    },
    devices: {
      passkeys: rows.passkeys.map((passkey) => ({
        ...passkey,
        createdAt: passkey.createdAt.toISOString(),
        lastUsedAt: iso(passkey.lastUsedAt),
      })),
      sessions: rows.sessions.map((session) => ({
        ...session,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: iso(session.lastSeenAt),
        expiresAt: session.expiresAt.toISOString(),
        revokedAt: iso(session.revokedAt),
      })),
      pushRegistrations: rows.pushRegistrations.map((registration) => ({
        ...registration,
        createdAt: registration.createdAt.toISOString(),
      })),
    },
    dismissedAnnouncements: rows.dismissed.map((view) => ({
      announcementId: view.announcementId,
      dismissedAt: view.viewedAt.toISOString(),
    })),
  }
}

/**
 * The attachment's file name, dated in the account's own time zone so it matches the day
 * the user sees; an unknown zone falls back to UTC.
 *
 * @param timeZone the account's IANA time zone.
 * @param now the export time.
 */
export function accountExportFileName(timeZone: string, now: Date): string {
  let zone = timeZone
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone })
  } catch {
    zone = 'UTC'
  }
  // en-CA formats a date as YYYY-MM-DD.
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return `persistent-export-${day}.json`
}
