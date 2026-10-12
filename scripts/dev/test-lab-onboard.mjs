/** Acknowledge current announcements through ordinary auth/API routes in the disposable fixture only. */
import { createServer } from 'node:http'
import { createApp } from '../../apps/api/dist/app.js'
import { announcements } from '../../apps/api/dist/lib/announcements.js'
import { prisma } from '../../apps/api/dist/lib/prisma.js'
import { fetchAfterDnsPropagation } from './test-lab-transport.mjs'
import { assertSyntheticAccounts, DEMO_EMAIL, FIXTURE_EMAILS } from './test-lab-accounts.mjs'

const emails = FIXTURE_EMAILS
const users = await prisma.user.findMany({ select: { email: true }, orderBy: { email: 'asc' } })
assertSyntheticAccounts(users, process.env.DEMO_MODE)
const externalOrigin = process.argv.find((arg) => arg.startsWith('--origin='))?.slice(9)
if (externalOrigin) {
  const parsed = new URL(externalOrigin)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.hostname === 'persistent.dynamic-solutions.ca') {
    throw new Error('Public onboarding requires the isolated credential-free HTTPS origin.')
  }
}
const server = externalOrigin ? null : createServer(createApp())
if (server) await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
const origin = externalOrigin ?? `http://127.0.0.1:${server.address().port}`
try {
  for (const email of emails) {
    const request = await fetchAfterDnsPropagation(`${origin}/api/auth/request-code`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
    })
    const code = (await request.json()).previewCode
    if (!request.ok || !code) throw new Error('Synthetic development sign-in unavailable.')
    const verified = await fetchAfterDnsPropagation(`${origin}/api/auth/verify-code`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code })
    })
    const cookie = verified.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ')
    if (!verified.ok || !cookie) throw new Error('Synthetic session unavailable.')
    const me = await (await fetchAfterDnsPropagation(`${origin}/api/auth/me`, { headers: { cookie } })).json()
    if ((me.user?.email ?? me.email) !== email) throw new Error('Synthetic session identity mismatch.')
    for (const item of announcements) {
      const viewed = await fetchAfterDnsPropagation(`${origin}/api/announcements/${encodeURIComponent(item.id)}/viewed`, { method: 'POST', headers: { cookie } })
      if (!viewed.ok) throw new Error('Announcement acknowledgement failed.')
    }
    const unread = await (await fetchAfterDnsPropagation(`${origin}/api/announcements`, { headers: { cookie } })).json()
    if (unread.announcements.length !== 0) throw new Error('Synthetic onboarding remains unread.')
    console.log(`Verified no unread announcements for ${email}.`)
    if (email === DEMO_EMAIL) {
      const projection = await (await fetchAfterDnsPropagation(`${origin}/api/sync/occurrences?alarmsOnly=true`, { headers: { cookie } })).json()
      const live = projection.alarms.filter((alarm) => alarm.fireAtMs <= Date.now())
      if (new Set(live.map((alarm) => alarm.title)).size !== live.length) throw new Error('Native fixture projection contains repeated live reminder names.')
      console.log(`Verified native projection: ${live.length} unique live reminder names.`)
    }
  }
  console.log(`Acknowledged only current repository announcement IDs: ${announcements.map((item) => item.id).join(', ')}`)
} finally {
  if (server) await new Promise((ready) => server.close(ready))
  await prisma.$disconnect()
}
