/** Re-sharing must preserve the original inviter, including registration/claim overlap. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PrismaClient } from '@prisma/client'
import type { Request, Response } from 'express'

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
const owner = { id: 'owner', email: 'owner@example.com', displayName: 'Owner' }
const current = { id: 'reminder', userId: owner.id, user: owner }
const grants = {
  findUnique: async () => null,
  count: async () => 0,
  findMany: async () => [{ recipientId: 'actor' }, { recipientId: 'recipient' }],
  upsert: async (input: { create: { invitedById: string | null } }) => ({
    recipientId: 'recipient', invitedById: input.create.invitedById
  })
}
const invitations = {
  findUnique: async () => ({ invitedById: 'original-inviter' }),
  count: async () => 0,
  deleteMany: async () => ({ count: 1 })
}
const testGlobal = globalThis as unknown as { prisma: PrismaClient }
const database = {
  $queryRaw: async () => [{ id: current.id }],
  reminder: { findFirst: async () => current },
  user: { findFirst: async () => ({ id: 'recipient', email: 'recipient@example.com', displayName: null }) },
  reminderShare: grants,
  reminderInvitation: invitations,
  reminderAssignment: { findUnique: async () => null },
  shareRecipient: { upsert: async () => ({}) },
  pushSubscription: { findMany: async () => [] }
}
testGlobal.prisma = { ...database, $transaction: async (action: (transaction: unknown) => Promise<unknown>) => action(database) } as unknown as PrismaClient
const { sharesRouter } = await import('./shares.js')

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: (request: Request, response: Response) => Promise<void> }[] }
}

/** Invoke the actual HTTP boundary with only its database replaced. */
async function add(): Promise<void> {
  const route = (sharesRouter.stack as Layer[]).find((layer) => layer.route?.path === '/:reminderId' && layer.route.methods.put)
  assert.ok(route)
  await route.route!.stack[0]!.handle({
    userId: 'actor', params: { reminderId: current.id },
    body: { email: 'recipient@example.com', permission: 'EDIT' }
  } as unknown as Request, { json: () => {} } as unknown as Response)
}

test('a known account with a pending invitation keeps the original inviter', async (context) => {
  const write = context.mock.method(grants, 'upsert')
  await add()
  assert.equal(write.mock.calls[0]?.arguments[0].create.invitedById, 'original-inviter')
})

test('re-adding an existing member cannot take over removal authority', async (context) => {
  context.mock.method(grants, 'findUnique', async () => ({ invitedById: 'original-inviter' }) as never)
  const write = context.mock.method(grants, 'upsert')
  await add()
  const input = write.mock.calls[0]?.arguments[0] as unknown as { update: Record<string, unknown> }
  assert.equal(Object.hasOwn(input.update, 'invitedById'), false)
})

test('claiming an existing pending slot does not consume another place at the member limit', async (context) => {
  context.mock.method(grants, 'count', async () => 20)
  const write = context.mock.method(grants, 'upsert')
  await add()
  assert.equal(write.mock.callCount(), 1)
})
