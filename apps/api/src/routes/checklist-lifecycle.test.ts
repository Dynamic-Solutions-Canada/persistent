/** Checklist progress cannot alter completed firings or outlive a revoked grant. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PrismaClient } from '@prisma/client'
import type { Request, Response } from 'express'

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
const reminder = { id: 'reminder', userId: 'owner', type: 'TODO', typeData: { items: [{ id: 'item', text: 'Synthetic' }] } }
const firing = { id: 'firing', reminderId: reminder.id, userId: 'owner', status: 'ACKNOWLEDGED', scheduledFor: new Date(), checkedItems: [], reminder }
const database = {
  $queryRaw: async () => [{ id: reminder.id }],
  $executeRaw: async (...input: unknown[]) => { void input; return 1 },
  reminder: { findFirst: async () => reminder },
  reminderOccurrence: { findFirst: async () => firing, findFirstOrThrow: async () => firing }
}
const testGlobal = globalThis as unknown as { prisma: PrismaClient }
testGlobal.prisma = { ...database, $transaction: async (action: (transaction: unknown) => Promise<unknown>) => action(database) } as unknown as PrismaClient
const { occurrencesRouter } = await import('./occurrences.js')
interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: (request: Request, response: Response) => Promise<void> }[] }
}
/** Exercise the real route with controlled persistence and a captured response. */
async function tick() {
  const route = (occurrencesRouter.stack as Layer[]).find((layer) => layer.route?.path === '/:id/check')
  assert.ok(route)
  let body: unknown
  await route.route!.stack[0]!.handle({ userId: 'member', params: { id: firing.id }, body: { itemId: 'item', checked: true } } as never,
    { json: (value: unknown) => { body = value } } as never)
  return body as { occurrence: { status: string; checkedItemIds: string[] } }
}

test('a completed firing is returned without changing its checklist', async (context) => {
  const write = context.mock.method(database, '$executeRaw')
  const result = await tick()
  assert.equal(result.occurrence.status, 'ACKNOWLEDGED')
  assert.deepEqual(result.occurrence.checkedItemIds, [])
  assert.equal(write.mock.callCount(), 0)
})

test('a grant revoked after the initial firing lookup prevents the progress write', async (context) => {
  context.mock.method(database.reminder, 'findFirst', async () => null as never)
  const write = context.mock.method(database, '$executeRaw')
  await assert.rejects(tick(), /Reminder not found/)
  assert.equal(write.mock.callCount(), 0)
})

test('completion between the status read and atomic tick returns the finished progress', async (context) => {
  context.mock.method(database.reminderOccurrence, 'findFirst', async () => ({ ...firing, status: 'FIRED' }))
  const write = context.mock.method(database, '$executeRaw', async () => 0)
  const result = await tick()
  assert.equal(write.mock.callCount(), 1)
  const sql = write.mock.calls[0]?.arguments[0] as unknown as TemplateStringsArray
  assert.match(sql.join(''), /"status" IN \('FIRED', 'ESCALATED', 'SNOOZED'\)/)
  assert.equal(result.occurrence.status, 'ACKNOWLEDGED')
  assert.deepEqual(result.occurrence.checkedItemIds, [])
})
