/** Unread announcements for the account's audience, and idempotent, account-scoped viewed records. */
import { Router } from 'express'
import { announcementIdSchema } from '@persistent/shared'
import { announcements, unreadAnnouncementsFor } from '../lib/announcements.js'
import { requireUserId } from '../lib/auth-middleware.js'
import { notFound } from '../lib/http-error.js'
import { prisma } from '../lib/prisma.js'
import { broadcast } from '../lib/realtime.js'
import { logger } from '../lib/logger.js'

export const announcementsRouter = Router()

announcementsRouter.get('/', async (request, response) => {
  const userId = requireUserId(request)
  const [account, views] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
    prisma.announcementView.findMany({
      where: { userId },
      select: { announcementId: true }
    })
  ])
  const viewedIds = new Set(views.map((view) => view.announcementId))
  response.setHeader('Cache-Control', 'no-store')
  // An account that no longer exists has nothing to read.
  response.json({ announcements: account ? unreadAnnouncementsFor(account.createdAt, viewedIds) : [] })
})

announcementsRouter.post('/:id/viewed', async (request, response) => {
  const userId = requireUserId(request)
  const parsed = announcementIdSchema.safeParse(request.params.id)
  if (!parsed.success || !announcements.some((announcement) => announcement.id === parsed.data)) {
    throw notFound('Announcement not found.')
  }
  // Duplicate dismissals and offline retries preserve the first viewed time.
  const result = await prisma.announcementView.createMany({
    data: [{ userId, announcementId: parsed.data }],
    skipDuplicates: true
  })
  if (result.count > 0) logger.info('announcement viewed', { userId, announcementId: parsed.data })
  broadcast(userId, { type: 'announcement.viewed' })
  response.setHeader('Cache-Control', 'no-store')
  response.json({ ok: true })
})
