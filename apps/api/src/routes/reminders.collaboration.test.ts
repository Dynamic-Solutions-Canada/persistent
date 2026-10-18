/** Concurrent editors must compare their original state under the sharing lock. */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type { PrismaClient } from '@prisma/client'
import type { Request, Response } from 'express'
import { MAX_TODO_ITEMS, reminderInputSchema, todoItems } from '@persistent/shared'

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
const openedAt = new Date('2026-10-18T12:00:00.000Z')
const input = reminderInputSchema.parse({
  title: 'Shopping', type: 'TODO', typeData: { items: [{ id: 'milk', text: 'Milk' }, { id: 'bread', text: 'Bread' }] },
  schedule: { kind: 'never', timesOfDay: [] }, startDate: '2026-10-18'
})
const initial = () => ({ ...structuredClone(input), id: 'reminder', userId: 'owner', checkedItems: [], hideCheckedItems: false, createdAt: openedAt, updatedAt: openedAt })
let row = initial()
let revoked = false
let writes = 0
let onLock = () => {}
let queue = Promise.resolve()
const database = {
  $queryRaw: async () => { onLock(); return revoked ? [] : [{ id: row.id }] },
  // The mock serializes transactions like the real parent FOR UPDATE lock.
  $transaction: async (action: (db: unknown) => Promise<unknown>) => {
    const pending = queue.then(() => action(database))
    queue = pending.then(() => {}, () => {})
    return pending
  },
  $executeRaw: async (sql: TemplateStringsArray, itemId: string, text: string) => {
    if (sql.join('').includes('AND NOT COALESCE')) {
      if (todoItems(row.typeData).some((item) => item.id === itemId)) return 0
      row.typeData = { items: [...todoItems(row.typeData), { id: itemId, text }] }
      writes++
      return 1
    }
    writes++
    row.typeData = { items: todoItems(row.typeData).map((item) => item.id === itemId ? { ...item, text } : item) }
    row.updatedAt = new Date(row.updatedAt.getTime() + 1)
    return 1
  },
  reminder: {
    findFirst: async () => revoked ? null : structuredClone(row),
    findFirstOrThrow: async () => structuredClone(row),
    findUnique: async () => structuredClone(row),
    update: async ({ where, data }: { where: { userId: string }; data: Partial<typeof row> }) => {
      assert.equal(where.userId, 'owner')
      writes++
      row = { ...row, ...data, shadeProminence: data.shadeProminence ?? row.shadeProminence, updatedAt: data.updatedAt ?? new Date() }
      return structuredClone(row)
    },
    updateMany: async ({ where, data }: { where: { userId: string }; data: Partial<typeof row> }) => {
      assert.equal(where.userId, 'owner')
      writes++
      row = { ...row, ...data, updatedAt: data.updatedAt ?? new Date(row.updatedAt.getTime() + 1) }
      return { count: 1 }
    }
  },
  reminderShare: { findMany: async () => [], findUnique: async () => ({ recipientId: 'member', shadeProminence: 'INHERIT' }), update: async () => ({}) },
  user: { findUnique: async () => null },
  reminderOccurrence: { deleteMany: async () => ({ count: 0 }), findMany: async () => [] },
  reminderAssignment: { findUnique: async () => null }
}
;(globalThis as unknown as { prisma: PrismaClient }).prisma = database as unknown as PrismaClient
const { remindersRouter } = await import('./reminders.js')
async function invoke(method: string, path: string, body: unknown, itemId = 'milk') {
  const layers = remindersRouter.stack as unknown as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (request: Request, response: Response, next: () => void) => Promise<void> }> } }>
  const route = layers.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route
  assert.ok(route)
  let response: unknown
  await route.stack[0]!.handle({ userId: 'member', params: { id: row.id, itemId }, body } as never,
    { json: (value: unknown) => { response = value } } as never, () => {})
  return response
}
const hasStatus = (status: number) => (error: unknown) => (error as { statusCode?: number }).statusCode === status
beforeEach(() => { row = initial(); revoked = false; writes = 0; onLock = () => {} })

test('two overlapping title edits accept one and report a conflict for the other', async () => {
  const results = await Promise.allSettled([
    invoke('patch', '/:id/content', { title: 'Groceries', expectedText: 'Shopping' }),
    invoke('patch', '/:id/content', { title: 'Weekend', expectedText: 'Shopping' })
  ])
  assert.equal(results[0]!.status, 'fulfilled')
  assert.equal(results[1]!.status, 'rejected')
  assert.ok(hasStatus(409)((results[1] as PromiseRejectedResult).reason))
  assert.equal(row.title, 'Groceries')
  assert.equal(writes, 1)
})

test('different content fields can save independently', async () => {
  row.type = 'NONE'
  row.details = 'Original body'
  await invoke('patch', '/:id/content', { title: 'New title', expectedText: 'Shopping' })
  await invoke('patch', '/:id/content', { details: 'New body', expectedText: 'Original body' })
  assert.equal(row.title, 'New title')
  assert.equal(row.details, 'New body')
})

test('same-item renames conflict, but a different item can still be renamed', async () => {
  await invoke('post', '/:id/items/:itemId', { text: 'Oat milk', expectedText: 'Milk' })
  await assert.rejects(invoke('post', '/:id/items/:itemId', { text: 'Whole milk', expectedText: 'Milk' }), hasStatus(409))
  await invoke('post', '/:id/items/:itemId', { text: 'Rye bread', expectedText: 'Bread' }, 'bread')
  assert.deepEqual(todoItems(row.typeData).map((item) => item.text), ['Oat milk', 'Rye bread'])
  assert.equal(writes, 2)
})

test('a full editor checks its opening version after waiting, regardless of the client clock', async () => {
  onLock = () => { row.updatedAt = new Date(openedAt.getTime() + 1000) }
  await assert.rejects(invoke('put', '/:id', {
    ...input, expectedUpdatedAt: openedAt.toISOString(), clientEditedAt: '2099-01-01T00:00:00.000Z'
  }), hasStatus(409))
  assert.equal(writes, 0)
})

test('a deleted item or changed reminder type is checked after the lock', async () => {
  onLock = () => { row.typeData = { items: [] } }
  await assert.rejects(invoke('post', '/:id/items/:itemId', { text: 'New', expectedText: 'Milk' }), hasStatus(404))
  onLock = () => { row.type = 'NONE' }
  await assert.rejects(invoke('post', '/:id/items/:itemId', { text: 'New', expectedText: 'Milk' }), hasStatus(400))
  assert.equal(writes, 0)
})

test('revocation while waiting blocks every focused definition write', async () => {
  onLock = () => { revoked = true }
  for (const [method, path, body] of [
    ['patch', '/:id/content', { title: 'New', expectedText: 'Shopping' }],
    ['post', '/:id/items', { id: 'new', text: 'New' }],
    ['post', '/:id/items/order', { itemIds: ['bread', 'milk'] }],
    ['post', '/:id/items/:itemId', { text: 'New', expectedText: 'Milk' }],
    ['delete', '/:id/items/:itemId', {}],
    ['post', '/:id/hide-checked', { hidden: true }]
  ] as const) {
    await assert.rejects(invoke(method, path, body), hasStatus(404))
  }
  assert.equal(writes, 0)
})


test('a presentation change preserves the latest definition conflict token', async () => {
  const latest = new Date(Date.now() + 1000)
  row.updatedAt = latest
  await invoke('post', '/:id/hide-checked', { hidden: true })
  assert.equal(row.hideCheckedItems, true)
  assert.equal(row.updatedAt.getTime(), latest.getTime())
  await assert.rejects(invoke('put', '/:id', { ...input, expectedUpdatedAt: openedAt.toISOString() }), hasStatus(409))
  assert.equal(writes, 1)
})

test('a replayed append remains idempotent when the checklist is full', async () => {
  row.typeData = { items: Array.from({ length: MAX_TODO_ITEMS }, (_, index) => ({ id: `item-${index}`, text: 'Synthetic' })) }
  await invoke('post', '/:id/items', { id: 'item-0', text: 'Synthetic' })
  assert.equal(todoItems(row.typeData).length, MAX_TODO_ITEMS)
  assert.equal(writes, 0)
  await assert.rejects(invoke('post', '/:id/items', { id: 'new', text: 'New' }), hasStatus(400))
})

test('a text edit advances a server token even when the previous token is ahead of the clock', async () => {
  const latest = new Date(Date.now() + 1000)
  row.updatedAt = latest
  await invoke('patch', '/:id/content', { title: 'New title', expectedText: 'Shopping' })
  assert.equal(row.updatedAt.getTime(), latest.getTime() + 1)
})


test('a matching full-editor version saves and returns a fresh server version', async () => {
  const response = await invoke('put', '/:id', { ...input, title: 'New checklist title', expectedUpdatedAt: openedAt.toISOString() }) as { reminder: { title: string; updatedAt: string } }
  assert.equal(response.reminder.title, 'New checklist title')
  assert.ok(new Date(response.reminder.updatedAt).getTime() > openedAt.getTime())
  assert.equal(writes, 1)
  await assert.rejects(invoke('put', '/:id', { ...input, expectedUpdatedAt: openedAt.toISOString() }), hasStatus(409))
  assert.equal(writes, 1)
})
