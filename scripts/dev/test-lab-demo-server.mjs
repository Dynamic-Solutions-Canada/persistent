/** Serve only the disposable synthetic demo, with a restricted mutation surface and bounded lifetime. */
import express from 'express'
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { createApp } from '../../apps/api/dist/app.js'
import { attachWsHub } from '../../apps/api/dist/lib/ws-hub.js'
import { setHub } from '../../apps/api/dist/lib/realtime.js'
import { startScheduler, stopScheduler } from '../../apps/api/dist/lib/scheduler.js'
import { prisma } from '../../apps/api/dist/lib/prisma.js'
import { announcements } from '../../apps/api/dist/lib/announcements.js'
import { attachUser, requireUserId } from '../../apps/api/dist/lib/auth-middleware.js'
import { HttpError } from '../../apps/api/dist/lib/http-error.js'
import { logger } from '../../apps/api/dist/lib/logger.js'
import { assertSyntheticAccounts } from './test-lab-accounts.mjs'
import { isCaptureSignIn, isCaptureEscalation, mayDeleteCaptureReminder } from './test-lab-demo-policy.mjs'

const ttl = Number(process.env.TEST_LAB_DEMO_TTL_SECONDS)
if (!Number.isInteger(ttl) || ttl < 60 || ttl > 5400) throw new Error('A demo lifetime of 60 to 5400 seconds is required.')
const users = await prisma.user.findMany({ select: { email: true } })
assertSyntheticAccounts(users, process.env.DEMO_MODE)

const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '64kb' }))
// The outer mutation guard queries reminders before entering the normal API app.
// Resolve its session first; the inner API still performs its own authorization.
app.use('/api/reminders', attachUser)
app.use(async (request, response, next) => {
  const path = request.path
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next()
  if (request.method === 'POST' && ['/api/auth/request-code', '/api/auth/verify-code'].includes(path)) {
    if (isCaptureSignIn(path, request.body)) return next()
  } else if (request.method === 'POST' && path === '/api/reminders') {
    requireUserId(request)
    if (isCaptureEscalation(request.body)) return next()
  } else if (request.method === 'DELETE' && /^\/api\/reminders\/[a-zA-Z0-9-]+$/.test(path)) {
    if (await mayDeleteCaptureReminder(requireUserId(request), path.split('/').at(-1),
      (query) => prisma.reminder.findFirst(query))) return next()
  } else if (request.method === 'POST' && ['/api/auth/logout', '/api/client-usage', '/api/push/subscriptions'].includes(path)) {
    return next()
  } else if (request.method === 'DELETE' && path === '/api/push/subscriptions') {
    return next()
  } else if (request.method === 'POST' && announcements.some((item) => path === `/api/announcements/${item.id}/viewed`)) {
    // Ordinary authenticated account onboarding, limited to current repository announcements.
    return next()
  }
  response.status(403).json({ error: 'This temporary server accepts only the reviewed synthetic capture workflow.' })
})
app.use(createApp())
// Outer-guard failures do not reach the nested app's error handler. Keep their
// observable error shape consistent without logging bodies or sign-in codes.
app.use((error, _request, response, next) => {
  if (response.headersSent) return next(error)
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({ error: error.message })
    return
  }
  logger.error('synthetic demo request failed', { category: error.name })
  response.status(500).json({ error: 'Internal server error.' })
})

const server = createServer(app)
const hub = attachWsHub(server)
setHub(hub)
startScheduler()
server.listen(4000, () => logger.info('synthetic-only demo server ready'))
server.on('error', (error) => { logger.error('synthetic demo listener failed', { category: error.name }); shutdown('listener error') })
writeFileSync('/workspace/demo-server.pid', String(process.pid))

/** End the temporary scheduler, sockets and DB connection on expiry or container teardown. */
function shutdown(reason) {
  logger.info('synthetic demo server shutdown', { reason })
  stopScheduler()
  hub.close()
  server.close(async () => { await prisma.$disconnect(); process.exit(0) })
  setTimeout(() => process.exit(0), 5_000).unref()
}
setTimeout(() => shutdown('configured expiry'), ttl * 1000)
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
