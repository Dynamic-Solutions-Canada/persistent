/**
 * "Download my data" against PostgreSQL, run by `npm run test:integration` (TEST-7). It needs
 * DATABASE_URL to name a migrated, disposable database whose name ends in `_test`, and it
 * replaces that database's users and email codes.
 *
 * It proves the export's three promises: only the signed-in account's own rows and what was
 * explicitly shared with it, no secret that could sign in or reach a device, and a stricter
 * rate limit than ordinary reads.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'

const testUrl = process.env.DATABASE_URL

/** Refuse anything but a disposable `_test` database, on a single connection. */
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

test("the account export holds only the account's own data and no secrets", async () => {
  configureTestDatabase()
  process.env.DEMO_MODE = 'true'
  const { prisma } = await import('../../apps/api/src/lib/prisma.js')
  const { createApp } = await import('../../apps/api/src/app.js')
  const { createSession } =
    await import('../../apps/api/src/lib/auth-session.js')
  const { accountExportSchema } = await import('@persistent/shared')
  const server = createApp().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`

  /** Export through real routing and cookie authentication. */
  function exportFor(cookie?: string): Promise<Response> {
    return fetch(`${origin}/api/auth/me/export`, {
      headers: cookie ? { cookie } : {},
    })
  }

  try {
    await prisma.user.deleteMany()
    await prisma.emailCode.deleteMany()

    // --- Fixtures: the exporting account, and an owner who shares one of two reminders.
    const me = await prisma.user.create({
      data: { email: 'me@example.test', timeZone: 'America/Toronto' },
    })
    const other = await prisma.user.create({
      data: { email: 'other@example.test' },
    })
    const mine = await prisma.reminder.create({
      data: {
        userId: me.id,
        title: 'My reminder',
        schedule: { kind: 'none' },
        startDate: '2026-11-18',
      },
    })
    await prisma.reminderOccurrence.create({
      data: {
        reminderId: mine.id,
        userId: me.id,
        scheduledFor: new Date('2026-11-18T14:00:00Z'),
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date('2026-11-18T14:05:00Z'),
      },
    })
    await prisma.reminderShare.create({
      data: { reminderId: mine.id, recipientId: other.id },
    })
    const sharedWithMe = await prisma.reminder.create({
      data: {
        userId: other.id,
        title: 'Shared with me',
        details: 'Owner-only details',
        schedule: { kind: 'none' },
        startDate: '2026-11-18',
      },
    })
    await prisma.reminderShare.create({
      data: { reminderId: sharedWithMe.id, recipientId: me.id },
    })
    await prisma.reminder.create({
      data: {
        userId: other.id,
        title: 'Not shared',
        schedule: { kind: 'none' },
        startDate: '2026-11-18',
      },
    })

    // --- Secrets that must never appear in the file.
    await prisma.passkey.create({
      data: {
        userId: me.id,
        credentialId: 'secret-credential-id',
        publicKey: Buffer.from('secret-public-key'),
        name: 'Laptop',
      },
    })
    await prisma.pushSubscription.create({
      data: {
        userId: me.id,
        kind: 'FCM',
        endpoint: 'secret-push-endpoint',
      },
    })
    await prisma.emailCode.create({
      data: {
        email: me.email,
        codeHash: 'secret-code-hash',
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    const session = await createSession(me.id)
    const cookie = `persistent_auth=${session.secret}`

    // --- Signed out, nothing is exported.
    assert.equal((await exportFor()).status, 401)

    const response = await exportFor(cookie)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match(
      response.headers.get('content-disposition') ?? '',
      /^attachment; filename="persistent-export-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    const text = await response.text()
    const data = accountExportSchema.parse(JSON.parse(text))

    // --- Only my own rows, plus the title and owner of what was shared with me.
    assert.equal(data.account.email, me.email)
    assert.deepEqual(
      data.reminders.map((reminder) => reminder.title),
      ['My reminder'],
    )
    assert.equal(data.reminders[0]!.occurrences.length, 1)
    assert.deepEqual(
      data.reminders[0]!.sharedWith.map((share) => share.email),
      [other.email],
    )
    assert.deepEqual(
      data.sharing.sharedWithMe.map((share) => [share.title, share.ownerEmail]),
      [['Shared with me', other.email]],
    )
    assert.equal(data.devices.passkeys[0]!.name, 'Laptop')
    assert.ok(!text.includes('Not shared'))
    assert.ok(!text.includes('Owner-only details'))
    assert.ok(!text.includes(me.id))

    // --- No secret, and no field that names one.
    for (const secret of [
      'secret-credential-id',
      Buffer.from('secret-public-key').toString('base64'),
      'secret-push-endpoint',
      'secret-code-hash',
      session.secret,
      'secretHash',
      'credentialId',
      'publicKey',
      'endpoint',
      'isAdmin',
    ]) {
      assert.ok(!text.includes(secret), `the export contains ${secret}`)
    }

    // --- Three exports an hour: two more succeed, the fourth is refused.
    assert.equal((await exportFor(cookie)).status, 200)
    assert.equal((await exportFor(cookie)).status, 200)
    assert.equal((await exportFor(cookie)).status, 429)
  } finally {
    server.close()
    await prisma.user.deleteMany()
    await prisma.emailCode.deleteMany()
    await prisma.$disconnect()
  }
})
