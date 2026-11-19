import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXPIRED_CODE_RETENTION_MS,
  pruneExpiredEmailCodes,
} from './email-code-retention.js'

/** A stand-in `emailCode` delegate that records the filter it was given. */
function recordingClient(count: number) {
  const calls: unknown[] = []
  const client = {
    emailCode: {
      deleteMany: async (args: unknown) => {
        calls.push(args)
        return { count }
      },
    },
  }
  return { client, calls }
}

test('expired sign-in codes are deleted a day after they expire, and only those', async () => {
  const now = new Date('2026-11-19T21:00:00.000Z')
  const { client, calls } = recordingClient(3)

  const deleted = await pruneExpiredEmailCodes(client as never, now)

  assert.equal(deleted, 3)
  assert.deepEqual(calls, [
    {
      where: {
        expiresAt: { lt: new Date(now.getTime() - EXPIRED_CODE_RETENTION_MS) },
      },
    },
  ])
  // The filter is on expiry alone: codes still inside their day of grace, and
  // live ones, are never matched, whether consumed or not.
  assert.equal(EXPIRED_CODE_RETENTION_MS, 24 * 60 * 60 * 1000)
})
