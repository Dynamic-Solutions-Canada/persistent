/** Undo must remove an accidental completion from the creator's progress record too. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PrismaClient } from '@prisma/client'
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
let latestDone: { acknowledgedAt: Date } | null = null
const writes: unknown[] = []
;(globalThis as unknown as { prisma: PrismaClient }).prisma = {
  reminderAssignment: {
    findUnique: async () => ({ id: 'assignment', creatorId: 'creator', recipientId: 'assignee' }),
    update: async (input: unknown) => { writes.push(input) }
  },
  reminderOccurrence: { findFirst: async () => latestDone }
} as unknown as PrismaClient
const { broadcastAssignmentProgress } = await import('./assignment-progress.js')
test('progress clears an undone sole completion and falls back to a remaining completion', async () => {
  await broadcastAssignmentProgress('reminder')
  assert.deepEqual(writes.pop(), { where: { id: 'assignment', creatorId: 'creator' }, data: { lastCompletedAt: null } })
  latestDone = { acknowledgedAt: new Date('2026-10-18T12:00:00Z') }
  await broadcastAssignmentProgress('reminder')
  assert.deepEqual(writes.pop(), { where: { id: 'assignment', creatorId: 'creator' }, data: { lastCompletedAt: latestDone.acknowledgedAt } })
})
