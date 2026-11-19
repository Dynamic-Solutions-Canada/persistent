/**
 * PostgreSQL regression for sign-in code retention, run by `npm run test:integration` (TEST-7). It
 * needs DATABASE_URL to name a migrated, disposable database whose name ends in `_test`, and it
 * writes and deletes email codes there. A missing or wrongly named database fails the run.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const testUrl = process.env.DATABASE_URL

/** Refuse anything but a disposable `_test` database, with one connection. */
function configureTestDatabase(): void {
  assert.ok(
    testUrl,
    'Set DATABASE_URL to a migrated disposable database ending in _test.',
  )
  const url = new URL(testUrl)
  assert.match(
    url.pathname,
    /_test$/,
    'Refusing a database whose name does not end in _test.',
  )
  url.searchParams.set('connection_limit', '1')
  process.env.DATABASE_URL = url.href
}

test('the retention prune deletes codes expired over a day ago and keeps newer ones', async () => {
  configureTestDatabase()
  const { prisma } = await import('../../apps/api/src/lib/prisma.js')
  const { pruneExpiredEmailCodes } =
    await import('../../apps/api/src/lib/email-code-retention.js')
  const now = new Date('2026-11-19T21:00:00.000Z')
  const hours = (count: number) => new Date(now.getTime() + count * 3_600_000)
  const emails = {
    old: 'retention-old@example.test',
    recent: 'retention-recent@example.test',
    live: 'retention-live@example.test',
  }

  try {
    await prisma.emailCode.deleteMany({
      where: { email: { in: Object.values(emails) } },
    })
    await prisma.emailCode.createMany({
      data: [
        // Expired 25 hours ago: past its day of grace.
        { email: emails.old, codeHash: 'old', expiresAt: hours(-25) },
        // Expired 23 hours ago, and consumed: still inside the day of grace.
        {
          email: emails.recent,
          codeHash: 'recent',
          expiresAt: hours(-23),
          consumedAt: hours(-23.5),
        },
        // Not yet expired.
        { email: emails.live, codeHash: 'live', expiresAt: hours(0.1) },
      ],
    })

    await pruneExpiredEmailCodes(prisma, now)

    const remaining = await prisma.emailCode.findMany({
      where: { email: { in: Object.values(emails) } },
      select: { email: true },
      orderBy: { email: 'asc' },
    })
    assert.deepEqual(
      remaining.map((row) => row.email),
      [emails.live, emails.recent],
    )
  } finally {
    await prisma.emailCode.deleteMany({
      where: { email: { in: Object.values(emails) } },
    })
    await prisma.$disconnect()
  }
})
