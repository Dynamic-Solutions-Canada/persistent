/**
 * Occurrence routes: the "due now / needs confirmation" feed plus the explicit
 * completion (ack), explicit undo, snooze, silence, and checklist-item actions.
 *
 * Acknowledging or snoozing broadcasts a `dismiss` (over WS and push) so the
 * notification clears on every one of the user's devices — the cross-device
 * dismiss sync that backs the "device-scheduled + server backup" model.
 * Silencing an escalation instead broadcasts a `silence`: it stops the alarm but
 * keeps the occurrence FIRED/nagging, and suppresses any further escalation.
 */
import { Router } from 'express'
import type { ReminderOccurrence } from '@prisma/client'
import {
  checkItemInputSchema,
  undoDoneInputSchema,
  MAX_SNOOZE_MINUTES,
  snoozeInputSchema,
  todoItems,
  type OccurrenceStatus,
  type TypeData
} from '@persistent/shared'
import { prisma } from '../lib/prisma.js'
import { requireUser, requireUserId } from '../lib/auth-middleware.js'
import { badRequest, conflict, notFound } from '../lib/http-error.js'
import { toOccurrence, toCheckedItemIds } from '../lib/serializers.js'
import { broadcast } from '../lib/realtime.js'
import { dispatchToUser, nudgeNativeSync } from '../lib/delivery/index.js'
import { notificationTitle, notificationBody } from '../lib/notification-format.js'
import { ackDecision } from '../lib/occurrence-ack.js'
import { logger } from '../lib/logger.js'
import { actionableOccurrence, broadcastSharedChange, participantIds, personalOccurrence } from '../lib/share-access.js'
import { withSharingReminder } from '../lib/sharing-access.js'
import { occurrenceForActor } from '../lib/recipient-alert-state.js'
import { broadcastAssignmentProgress } from '../lib/assignment-progress.js'

export const occurrencesRouter = Router()
occurrencesRouter.use(requireUser)

/** Statuses that still need user attention. */
const ACTIVE_STATUSES: OccurrenceStatus[] = ['FIRED', 'ESCALATED', 'SNOOZED']
/** Past entries: handled, expired, or auto-resolved by a newer firing. */
const HISTORY_STATUSES: OccurrenceStatus[] = ['ACKNOWLEDGED', 'MISSED', 'SUPERSEDED']

/**
 * History is the only feed that grows without bound — nothing prunes acknowledged
 * occurrences, so a daily reminder adds 365 rows a year and a three-dose
 * medication ~1,100, each carrying a denormalized copy of its reminder. Active and
 * upcoming answer "what is nagging" and "what is next", which are small by
 * construction, so they still return whole.
 */
const HISTORY_PAGE_SIZE = 50

// GET /api/occurrences?scope=active|upcoming|history[&cursor=<occurrenceId>]
occurrencesRouter.get('/', async (request, response) => {
  const userId = requireUserId(request)
  const scope =
    request.query.scope === 'upcoming' ? 'upcoming' : request.query.scope === 'history' ? 'history' : 'active'

  if (scope === 'history') {
    const cursor =
      typeof request.query.cursor === 'string' && request.query.cursor.length > 0 ? request.query.cursor : undefined

    const rows = await prisma.reminderOccurrence.findMany({
      where: {
        OR: [{ userId }, { reminder: { shares: { some: { recipientId: userId } } } }],
        status: { in: HISTORY_STATUSES }
      },
      include: { reminder: true, recipientAlerts: { where: { recipientId: userId } } },
      // A *total* ordering, deliberately. One reminder can't have two firings at
      // the same instant (@@unique([reminderId, scheduledFor])), but *different*
      // reminders routinely share one — every reminder set to 09:00 fires
      // together — and history spans all of them. A cursor into a partially
      // ordered set silently skips or repeats the rows sharing the boundary
      // value, so the id tiebreak is what makes each page exact.
      orderBy: [{ scheduledFor: 'desc' }, { id: 'desc' }],
      // One extra row answers "is there another page?" without a second count
      // query; it is sliced off before serializing.
      take: HISTORY_PAGE_SIZE + 1,
      // `skip: 1` steps past the cursor row itself — the client already has it.
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    })

    const hasMore = rows.length > HISTORY_PAGE_SIZE
    const page = hasMore ? rows.slice(0, HISTORY_PAGE_SIZE) : rows
    response.json({
      occurrences: page.map((row) => toOccurrence(occurrenceForActor(row, userId, row.recipientAlerts[0]))),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null
    })
    return
  }

  const statusWhere =
    scope === 'upcoming'
      ? { status: 'PENDING' as OccurrenceStatus }
      : { status: { in: ACTIVE_STATUSES } }

  const occurrences = await prisma.reminderOccurrence.findMany({
    where: {
      ...statusWhere,
      OR: [{ userId }, { reminder: { shares: { some: { recipientId: userId } } } }]
    },
    include: { reminder: true, recipientAlerts: { where: { recipientId: userId } } },
    orderBy: { scheduledFor: scope === 'upcoming' ? 'asc' : 'desc' },
    take: scope === 'upcoming' ? 100 : 200
  })
  response.json({
    occurrences: occurrences.map((row) => toOccurrence(occurrenceForActor(row, userId, row.recipientAlerts[0]))),
    nextCursor: null
  })
})

occurrencesRouter.post('/:id/ack', async (request, response) => {
  const userId = requireUserId(request)
  const existing = await actionableOccurrence(request.params.id, userId)
  if (!existing) throw notFound('Occurrence not found.')
  const personal = await personalOccurrence(existing, userId)

  // An ack confirms a *nagging* occurrence is done; acking one that is not yet
  // due would silently cancel its firing (the tick only fires PENDING). Log every
  // ack with its prior status + client so a premature ack is traceable.
  const now = new Date()
  const decision = ackDecision(personal.status, existing.scheduledFor, now)
  logger.info('occurrence ack', {
    occurrenceId: existing.id,
    reminderId: existing.reminderId,
    priorStatus: personal.status,
    decision,
    userAgent: request.get('user-agent') ?? undefined
  })

  if (decision === 'reject') {
    throw conflict(`Cannot acknowledge a ${personal.status} occurrence.`)
  }
  if (decision === 'noop') {
    // Idempotent retry: already acknowledged and already dismissed everywhere.
    response.json({ occurrence: toOccurrence(personal) })
    return
  }

  // Another participant may finish between the read and write. Do not let a
  // delayed request overwrite that terminal state or send a second dismissal.
  const claimed = await prisma.reminderOccurrence.updateMany({
    where: { id: existing.id, status: { in: ['PENDING', 'FIRED', 'ESCALATED', 'SNOOZED'] } },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: now,
      // A due PENDING ack (native alarm beat the server tick) never got a firedAt;
      // stamp it from scheduledFor so history/escalation anchors stay coherent.
      ...(existing.firedAt ? {} : { firedAt: existing.scheduledFor })
    }
  })
  const updated = await prisma.reminderOccurrence.findUniqueOrThrow({
    where: { id: existing.id },
    include: { reminder: true }
  })
  if (claimed.count === 0) {
    response.json({ occurrence: toOccurrence(occurrenceForActor(updated, userId, null)) })
    return
  }

  const members = await participantIds(existing.reminderId, existing.userId)
  for (const memberId of members) await dismissEverywhere(memberId, updated.id)
  broadcast(existing.userId, { type: 'occurrence.changed', occurrence: toOccurrence(updated) })
  await broadcastSharedChange(existing.reminderId, existing.userId)
  response.json({ occurrence: toOccurrence(occurrenceForActor(updated, userId, null)) })
})

// Undo reopens exactly one completion; it never creates a new firing or changes its schedule.
occurrencesRouter.post('/:id/undo-done', async (request, response) => {
  const userId = requireUserId(request)
  const parsed = undoDoneInputSchema.safeParse(request.body)
  if (!parsed.success) throw badRequest('Invalid completion to undo.')
  const existing = await actionableOccurrence(request.params.id, userId)
  if (!existing) throw notFound('Occurrence not found.')
  const now = new Date()
  const updated = await withSharingReminder(existing.reminderId, userId, async (transaction, reminder) => {
    // The conditional write also serializes against Done. A retry after a later
    // completion must never reopen that newer completion.
    const changed = await transaction.reminderOccurrence.updateMany({
      where: {
        id: existing.id, userId: reminder.userId, reminderId: reminder.id,
        status: 'ACKNOWLEDGED', acknowledgedAt: new Date(parsed.data.acknowledgedAt)
      },
      data: {
        status: 'FIRED', acknowledgedAt: null, snoozedUntil: null,
        escalatedAt: null, escalationSilencedAt: now, lastNotifiedAt: now
      }
    })
    if (!changed.count) throw conflict('This completion has changed. Refresh History before trying again.')
    // Notes cannot have live firings. Changing back to a reminder is a separate edit.
    if ((reminder.schedule as { kind?: string }).kind === 'never') {
      throw conflict('This reminder is now a note. Change its schedule before undoing completion.')
    }
    // A member who never snoozed/escalated may not have a personal state yet.
    // Give every current recipient the same restored, non-escalated starting point.
    const shares = await transaction.reminderShare.findMany({
      where: { reminderId: reminder.id, reminder: { userId: reminder.userId } },
      select: { recipientId: true }
    })
    await transaction.recipientAlertState.createMany({
      data: shares.map(({ recipientId }) => ({
        occurrenceId: existing.id, recipientId, escalationSilencedAt: now, lastNotifiedAt: now
      })),
      skipDuplicates: true
    })
    await transaction.recipientAlertState.updateMany({
      where: { occurrenceId: existing.id, occurrence: { userId: reminder.userId } },
      data: { snoozedUntil: null, escalatedAt: null, escalationSilencedAt: now, lastNotifiedAt: now }
    })
    return transaction.reminderOccurrence.findFirstOrThrow({
      where: { id: existing.id, userId: reminder.userId }, include: { reminder: true }
    })
  })
  logger.info('occurrence completion undone', { occurrenceId: updated.id, reminderId: updated.reminderId, actorId: userId })
  broadcast(updated.userId, { type: 'occurrence.changed', occurrence: toOccurrence(updated) })
  await broadcastSharedChange(updated.reminderId, updated.userId)
  void nudgeNativeSync(updated.userId).catch((error) =>
    logger.warn('undo completion sync nudge failed', { error: String(error), occurrenceId: updated.id })
  )
  response.json({ occurrence: toOccurrence(updated) })
})

occurrencesRouter.post('/:id/snooze', async (request, response) => {
  const userId = requireUserId(request)
  const parsed = snoozeInputSchema.safeParse(request.body)
  if (!parsed.success) throw badRequest('Invalid snooze choice.')

  const existing = await actionableOccurrence(request.params.id, userId)
  if (!existing) throw notFound('Occurrence not found.')
  const personal = await personalOccurrence(existing, userId)

  // Only a nagging occurrence can be snoozed — a queued device snooze draining
  // after an ack must not resurrect a terminal occurrence (same guard as silence).
  if (personal.status !== 'FIRED' && personal.status !== 'ESCALATED' && personal.status !== 'SNOOZED') {
    response.json({ occurrence: toOccurrence(personal) })
    return
  }

  const now = Date.now()
  const snoozedUntil = 'until' in parsed.data
    ? new Date(parsed.data.until)
    : new Date(now + parsed.data.minutes * 60_000)
  // The picker sends an exact instant. Check its range when the request reaches
  // the server, including when an offline mutation is replayed later.
  if (snoozedUntil.getTime() <= now || snoozedUntil.getTime() - now > MAX_SNOOZE_MINUTES * 60_000) {
    logger.warn('snooze time rejected', { occurrenceId: existing.id, userId })
    throw badRequest('Snooze time must be in the future and within one year.')
  }
  if (userId === existing.userId) {
    const changed = await prisma.reminderOccurrence.updateMany({
      where: { id: existing.id, status: { in: ['FIRED', 'ESCALATED', 'SNOOZED'] } },
      data: { status: 'SNOOZED', snoozedUntil }
    })
    const updated = await prisma.reminderOccurrence.findUniqueOrThrow({
      where: { id: existing.id },
      include: { reminder: true }
    })
    if (changed.count === 0) {
      response.json({ occurrence: toOccurrence(updated) })
      return
    }
    await dismissEverywhere(userId, updated.id)
    broadcast(userId, { type: 'occurrence.changed', occurrence: toOccurrence(updated) })
    await broadcastAssignmentProgress(existing.reminderId)
    response.json({ occurrence: toOccurrence(updated) })
    return
  }

  const state = await prisma.recipientAlertState.upsert({
    where: { occurrenceId_recipientId: { occurrenceId: existing.id, recipientId: userId } },
    create: { occurrenceId: existing.id, recipientId: userId, snoozedUntil },
    update: { snoozedUntil }
  })
  const updated = occurrenceForActor(existing, userId, state)
  await dismissEverywhere(userId, updated.id)
  broadcast(userId, { type: 'occurrence.changed', occurrence: toOccurrence(updated) })
  broadcast(userId, { type: 'reminder.changed', reminderId: existing.reminderId })
  await broadcastAssignmentProgress(existing.reminderId)
  response.json({ occurrence: toOccurrence(updated) })
})

// Tick / untick one checklist item on one firing (TODO reminders). The checked set
// belongs to the occurrence, not the reminder, so a repeating checklist starts each
// firing blank.
//
// This deliberately does NOT acknowledge the occurrence when the last item is
// ticked: only Done clears a firing (docs/notification-behavior.md §1a), and a
// checklist you tick as you go would otherwise silently confirm itself mid-task.
occurrencesRouter.post('/:id/check', async (request, response) => {
  const userId = requireUserId(request)
  const parsed = checkItemInputSchema.safeParse(request.body)
  if (!parsed.success) throw badRequest('Invalid checklist item.')

  const existing = await actionableOccurrence(request.params.id, userId)
  if (!existing) throw notFound('Occurrence not found.')
  const result = await withSharingReminder(existing.reminderId, userId, async (transaction, reminder) => {
    const current = await transaction.reminderOccurrence.findFirst({
      where: { id: existing.id, userId: reminder.userId, reminderId: reminder.id },
      include: { reminder: true }
    })
    if (!current) throw notFound('Occurrence not found.')
    if (current.reminder.type !== 'TODO') throw badRequest('This reminder has no checklist.')

    const items = todoItems((current.reminder.typeData ?? {}) as TypeData)
    if (!items.some((item) => item.id === parsed.data.itemId)) throw notFound('Checklist item not found.')

    // Only a nagging firing has a checklist to work through. Same guard as
    // silence/snooze: a toggle queued on a device and drained after the ack must not
    // rewrite a finished firing's record of what was actually done.
    if (current.status !== 'FIRED' && current.status !== 'ESCALATED' && current.status !== 'SNOOZED') {
      return { updated: current, changed: false }
    }

    // Applied as ONE atomic statement rather than the obvious read-modify-write,
    // which loses a tick whenever two arrive together — and they do: working down a
    // checklist means tapping several items in quick succession, and each tap is its
    // own request. Read-modify-write has both read `[]` before either write lands, so
    // the second overwrites the first.
    //
    // `-` removes every matching element (so re-ticking can't duplicate, making the
    // toggle idempotent for offline replays) and `||` appends. The tagged template
    // parameterizes this atomic write; ownership and live status remain predicates
    // even after authorization was rechecked under the reminder lock.
    const { itemId, checked } = parsed.data
    const changed = await transaction.$executeRaw`
      UPDATE "ReminderOccurrence"
      SET "checkedItems" = CASE
        WHEN ${checked}::boolean THEN ("checkedItems" - ${itemId}::text) || jsonb_build_array(${itemId}::text)
        ELSE "checkedItems" - ${itemId}::text
      END
      WHERE "id" = ${current.id} AND "userId" = ${current.userId}
        AND "status" IN ('FIRED', 'ESCALATED', 'SNOOZED')
    `
    const updated = await transaction.reminderOccurrence.findFirstOrThrow({
      where: { id: current.id, userId: current.userId },
      include: { reminder: true }
    })

    return { updated, changed: changed > 0 }
  })
  const { updated } = result
  if (!result.changed) {
    response.json({ occurrence: toOccurrence(updated) })
    return
  }

  // A notification lists only the items still unticked, so this tick changed its
  // text. Web clients converge over WS; native devices need the FCM-only `sync` to
  // re-pull and re-post the nag (silently — `ensureNags` re-posts on text drift
  // with `alertOnce`, so refreshing the list never re-alerts).
  // Not awaited: working down a checklist is a burst of taps, and none of them
  // should wait on an FCM round trip to answer.
  broadcast(existing.userId, { type: 'occurrence.changed', occurrence: toOccurrence(updated) })
  await broadcastSharedChange(existing.reminderId, existing.userId)
  void nudgeNativeSync(existing.userId).catch((error) =>
    logger.warn('checklist sync nudge failed', { error: String(error), occurrenceId: updated.id })
  )
  response.json({ occurrence: toOccurrence(updated) })
})

// Silence an escalation alarm: stop the alarm but keep the occurrence FIRED so it
// keeps nagging (and never escalates again — escalationSilencedAt suppresses the
// sweep and the on-device escalation alarm). Unlike ack/snooze this does NOT
// dismiss the notification; it downgrades it across every device.
occurrencesRouter.post('/:id/silence', async (request, response) => {
  const userId = requireUserId(request)
  const existing = await actionableOccurrence(request.params.id, userId)
  if (!existing) throw notFound('Occurrence not found.')
  const personal = await personalOccurrence(existing, userId)

  // Silence only means something for a nagging occurrence. It must NEVER touch a
  // terminal one: a device can queue a silence and an ack for the same occurrence
  // and drain them in one batch — without this guard the trailing silence flipped
  // the just-ACKNOWLEDGED occurrence back to FIRED, resurrecting a done reminder.
  if (personal.status !== 'FIRED' && personal.status !== 'ESCALATED' && personal.status !== 'SNOOZED') {
    response.json({ occurrence: toOccurrence(personal) })
    return
  }

  if (userId !== existing.userId) {
    const state = await prisma.recipientAlertState.upsert({
      where: { occurrenceId_recipientId: { occurrenceId: existing.id, recipientId: userId } },
      create: {
        occurrenceId: existing.id,
        recipientId: userId,
        escalationSilencedAt: new Date()
      },
      update: { escalationSilencedAt: personal.escalationSilencedAt ?? new Date(), snoozedUntil: null }
    })
    const updated = occurrenceForActor(existing, userId, state)
    await silenceEverywhere(userId, updated)
    broadcast(userId, { type: 'occurrence.changed', occurrence: toOccurrence(updated) })
    broadcast(userId, { type: 'reminder.changed', reminderId: existing.reminderId })
    await broadcastAssignmentProgress(existing.reminderId)
    response.json({ occurrence: toOccurrence(updated) })
    return
  }

  const changed = await prisma.reminderOccurrence.updateMany({
    where: { id: existing.id, status: { in: ['FIRED', 'ESCALATED', 'SNOOZED'] } },
    // Back to FIRED (still nagging); keep firedAt as the original anchor. The
    // silenced stamp is what stops re-escalation, not the status.
    data: { status: 'FIRED', escalationSilencedAt: existing.escalationSilencedAt ?? new Date(), snoozedUntil: null }
  })
  const updated = await prisma.reminderOccurrence.findUniqueOrThrow({
    where: { id: existing.id },
    include: { reminder: true }
  })
  if (changed.count === 0) {
    response.json({ occurrence: toOccurrence(updated) })
    return
  }

  await silenceEverywhere(userId, updated)
  broadcast(userId, { type: 'occurrence.changed', occurrence: toOccurrence(updated) })
  await broadcastAssignmentProgress(existing.reminderId)
  response.json({ occurrence: toOccurrence(updated) })
})

async function dismissEverywhere(userId: string, occurrenceId: string): Promise<void> {
  broadcast(userId, { type: 'dismiss', occurrenceId })
  await dispatchToUser(userId, { type: 'dismiss', occurrenceId })
}

/**
 * Tell every device to stop the alarm but keep the soft nag for this occurrence.
 * The downgraded nag carries the firing's own text, so a checklist still lists
 * only what is unticked.
 */
async function silenceEverywhere(
  userId: string,
  occurrence: ReminderOccurrence & { reminder: Parameters<typeof notificationTitle>[0] & Parameters<typeof notificationBody>[0] }
): Promise<void> {
  broadcast(userId, { type: 'silence', occurrenceId: occurrence.id })
  // No tones here, deliberately. What the alarm drops back to is a soft nag, which
  // should re-sound in the reminder's soft tone — but the device already has that:
  // an escalation upgrades the base occurrence in place, so the armed base alarm is
  // this firing's pre-escalation form, tones included. `AlarmService.silenceOccurrence`
  // reads it from there, which is also the only thing that can work for the two
  // silences that involve no push at all (the shade action and the car reply).
  await dispatchToUser(userId, {
    type: 'silence',
    occurrenceId: occurrence.id,
    title: notificationTitle(occurrence.reminder),
    body: notificationBody(occurrence.reminder, toCheckedItemIds(occurrence.checkedItems)),
    alarm: false
  })
}
