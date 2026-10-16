/** Read-only cross-user aggregates behind a fresh database admin check on every request. */
import { Router } from 'express'
import { adminGrowthDaysSchema } from '@persistent/shared'
import { requireAdmin } from '../lib/admin-access.js'
import { readAdminStats } from '../lib/admin-stats.js'
import { badRequest } from '../lib/http-error.js'

export const adminRouter = Router()

adminRouter.get('/stats', async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  await requireAdmin(request)
  const days = request.query.activeDays ?? '30'
  if (days !== '7' && days !== '30') throw badRequest('Choose a 7-day or 30-day activity window.')
  const growth = request.query.growthDays ?? '90'
  const growthDays = adminGrowthDaysSchema.safeParse(typeof growth === 'string' ? Number(growth) : null)
  if (!growthDays.success) throw badRequest('Choose a 30-day, 90-day or 365-day growth window.')
  response.json(await readAdminStats(days === '7' ? 7 : 30, new Date(), growthDays.data))
})
