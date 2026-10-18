/** Undo is scoped, versioned, and preserves the original obligation rather than making another. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PrismaClient } from '@prisma/client'
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
const now = new Date('2026-10-18T12:00:00Z')
let status = 'ACKNOWLEDGED'
let acknowledgedAt: Date | null = now
let actor = 'owner'
let revoked = false
let kind = 'none'
const checkedItems = ['milk']
const updates: unknown[] = []
const reminder = { id: 'reminder', userId: 'owner', schedule: { kind }, title: 'Shopping', type: 'TODO', typeData: {}, persistence: 'PERSISTENT', details: null, hideCheckedItems: false, soundIntervalSeconds: null, shadeProminence: 'INHERIT' }
const row = () => ({ id: 'firing', reminderId: 'reminder', userId: 'owner', status, scheduledFor: now, firedAt: now, lastNotifiedAt: now, acknowledgedAt, snoozedUntil: null, escalatedAt: null, escalationSilencedAt: null, supersededAt: null, checkedItems, reminder: { ...reminder, schedule: { kind } } })
const database = {
  reminderOccurrence: {
    findFirst: async (args: { where: { OR?: unknown } }) => {
      if (args.where.OR && actor === 'outsider') return null
      return row()
    },
    updateMany: async (args: { where: { userId: string; status: string; acknowledgedAt: Date }; data: { status: string; acknowledgedAt: null } }) => {
      updates.push(args)
      assert.equal(args.where.userId, 'owner')
      if (status !== args.where.status || acknowledgedAt?.getTime() !== args.where.acknowledgedAt.getTime()) return { count: 0 }
      status = args.data.status
      acknowledgedAt = args.data.acknowledgedAt
      return { count: 1 }
    },
    findFirstOrThrow: async () => row()
  },
  reminder: { findFirst: async () => revoked ? null : { ...reminder, schedule: { kind } } },
  recipientAlertState: { createMany: async (args: unknown) => { updates.push(args); return { count: 1 } }, updateMany: async (args: unknown) => { updates.push(args); return { count: 1 } } },
  reminderShare: { findMany: async () => [{ recipientId: 'recipient' }] },
  reminderAssignment: { findUnique: async () => null },
  $queryRaw: async () => actor === 'outsider' ? [] : [{ id: 'reminder' }],
  $transaction: async (action: (db: unknown) => Promise<unknown>) => {
    const snapshot = { status, acknowledgedAt }
    try { return await action(database) } catch (error) { status = snapshot.status; acknowledgedAt = snapshot.acknowledgedAt; throw error }
  }
}
;(globalThis as unknown as { prisma: PrismaClient }).prisma = database as unknown as PrismaClient
const { occurrencesRouter } = await import('./occurrences.js')
const layer = occurrencesRouter.stack.find((item: { route?: { path: string } }) => item.route?.path === '/:id/undo-done')
assert.ok(layer?.route)
const handler = layer.route.stack[0]!.handle
async function undo(timestamp = now.toISOString()) {
  let result: unknown
  await handler({ userId: actor, params: { id: 'firing' }, body: { acknowledgedAt: timestamp } } as never, { json: (value: unknown) => { result = value } } as never, () => {})
  return result as { occurrence: { status: string; checkedItemIds: string[]; scheduledFor: string } }
}
test('undo completion guards and state changes', async (context) => {
  for (const member of ['owner', 'recipient']) await context.test(member, async () => {
    actor = member; status = 'ACKNOWLEDGED'; acknowledgedAt = now; updates.length = 0
    const result = await undo()
    assert.equal(result.occurrence.status, 'FIRED')
    assert.deepEqual(result.occurrence.checkedItemIds, checkedItems)
    assert.equal(result.occurrence.scheduledFor, now.toISOString())
    assert.equal(updates.length, 3)
    assert.ok(JSON.stringify(updates[1]).includes('recipient'))
    await assert.rejects(undo(), /completion has changed/)
  })
  actor = 'owner'; status = 'ACKNOWLEDGED'; acknowledgedAt = new Date(now.getTime() + 1000)
  await assert.rejects(undo(), /completion has changed/)
  assert.equal(status, 'ACKNOWLEDGED')
  actor = 'outsider'; await assert.rejects(undo(), /Occurrence not found/)
  actor = 'recipient'; revoked = true; await assert.rejects(undo(), /Reminder not found/)
  revoked = false; actor = 'owner'; kind = 'never'; acknowledgedAt = now
  await assert.rejects(undo(), /now a note/)
  assert.equal(status, 'ACKNOWLEDGED')
})
