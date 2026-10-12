/** Checklist access must require ownership or an explicit grant for the actor and reminder. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PrismaClient } from '@prisma/client'

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
// Prisma delegates expose virtual methods; replace the database boundary before import.
const delegate = { findFirst: async (input: unknown) => { void input; return null } }
const firingDelegate = { findFirst: async (input: unknown) => { void input; return null } }
const testGlobal = globalThis as unknown as { prisma: PrismaClient }
testGlobal.prisma = { reminder: delegate, reminderOccurrence: firingDelegate } as unknown as PrismaClient
const { actionableReminder, actionableOccurrence, editableReminder } = await import('./share-access.js')

for (const [name, lookup] of [['progress', actionableReminder], ['definition', editableReminder]] as const) {
  test(`${name} access scopes the exact reminder and authenticated recipient`, async (context) => {
    const find = context.mock.method(delegate, 'findFirst')
    assert.equal(await lookup('requested-reminder', 'actor'), null)
    assert.deepEqual(find.mock.calls[0]?.arguments[0], {
      where: {
        id: 'requested-reminder',
        OR: [{ userId: 'actor' }, { shares: { some: { recipientId: 'actor' } } }]
      }
    })
  })
}

test("firing progress access joins the explicit grant through that firing's reminder", async (context) => {
  const find = context.mock.method(firingDelegate, 'findFirst')
  assert.equal(await actionableOccurrence('requested-firing', 'actor'), null)
  assert.deepEqual(find.mock.calls[0]?.arguments[0], {
    where: {
      id: 'requested-firing',
      OR: [
        { userId: 'actor' },
        { reminder: { shares: { some: { recipientId: 'actor' } } } }
      ]
    },
    include: { reminder: true }
  })
})
