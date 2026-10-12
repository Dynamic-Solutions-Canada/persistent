/** Refuse duplicate live synthetic firings without changing reminder lifecycle or history. */
import { prisma } from '../../apps/api/dist/lib/prisma.js'
import { assertSyntheticAccounts, DEMO_EMAIL } from './test-lab-accounts.mjs'

const users = await prisma.user.findMany({ select: { id: true, email: true }, orderBy: { email: 'asc' } })
assertSyntheticAccounts(users, process.env.DEMO_MODE)
const userId = users.find((user) => user.email === DEMO_EMAIL).id
try {
  const live = await prisma.reminderOccurrence.findMany({ where: { userId, status: 'FIRED' }, select: { reminderId: true } })
  if (new Set(live.map((row) => row.reminderId)).size !== live.length) {
    throw new Error('Duplicate fixture firings require correction in synthetic seed generation. No lifecycle states changed.')
  }
  console.log(`Synthetic fixture verified: ${live.length} unique live reminders; all lifecycle states and history unchanged.`)
} finally {
  await prisma.$disconnect()
}
