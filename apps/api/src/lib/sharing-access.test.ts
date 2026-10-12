/** Members can collaborate, but only the owner and original inviter may remove access. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PrismaClient } from '@prisma/client'

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
const delegate = { findFirst: async (input: unknown) => { void input; return null } }
const testGlobal = globalThis as unknown as { prisma: PrismaClient }
testGlobal.prisma = { reminder: delegate } as unknown as PrismaClient
const { sharingReminder, canManageInvitation } = await import('./sharing-access.js')

test('only owner or original inviter manages a grant, including legacy grants', () => {
  assert.equal(canManageInvitation('owner', 'inviter', 'owner'), true)
  assert.equal(canManageInvitation('owner', 'inviter', 'inviter'), true)
  assert.equal(canManageInvitation('owner', 'inviter', 'other-member'), false)
  assert.equal(canManageInvitation('owner', null, 'owner'), true)
  assert.equal(canManageInvitation('owner', null, 'member'), false)
})

test('sharing access proves an exact current grant before exposing the roster', async (context) => {
  const lookup = context.mock.method(delegate, 'findFirst')
  assert.equal(await sharingReminder('reminder', 'member'), null)
  assert.deepEqual(lookup.mock.calls[0]?.arguments[0], {
    where: { id: 'reminder', OR: [{ userId: 'member' }, { shares: { some: { recipientId: 'member' } } }] },
    include: { user: { select: { id: true, email: true, displayName: true } } }
  })
})

test('a grant revoked while waiting for the parent lock fails the fresh authorization check', async (context) => {
  const { lockSharingReminder } = await import('./sharing-access.js')
  const events: string[] = []
  context.mock.method(delegate, 'findFirst', async () => {
    events.push('recheck')
    return null
  })
  const transaction = {
    reminder: delegate,
    $queryRaw: async () => { events.push('lock'); return [{ id: 'reminder' }] }
  }
  await assert.rejects(lockSharingReminder(transaction as never, 'reminder', 'revoked'), /Reminder not found/)
  assert.deepEqual(events, ['lock', 'recheck'])
})

test('a caller without a locked authorized row cannot write even if a later grant appears', async (context) => {
  const { lockSharingReminder } = await import('./sharing-access.js')
  const lookup = context.mock.method(delegate, 'findFirst')
  await assert.rejects(lockSharingReminder({
    reminder: delegate, $queryRaw: async () => []
  } as never, 'reminder', 'outsider'), /Reminder not found/)
  assert.equal(lookup.mock.callCount(), 0)
})
