/**
 * Retention for sign-in codes: delete `EmailCode` rows a day after they expire.
 *
 * A code is useless once it expires (10 minutes) or is consumed, but each row
 * still names the address that asked for it, so without pruning every address
 * that ever requested a code, including ones that never became an account,
 * would be kept indefinitely. The day of grace keeps recent rows for the
 * per-address rate limit (a 15-minute window over `createdAt`) and for
 * diagnosing a sign-in problem reported the same day.
 */
import type { PrismaClient } from '../generated/prisma/client.js'

/** How long an expired code's row is kept before it is deleted. */
export const EXPIRED_CODE_RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * Delete every sign-in code that expired more than a day before `now`.
 *
 * @param client The Prisma client (only its `emailCode` delegate is used).
 * @param now The current time; a parameter so tests can fix it.
 * @returns How many rows were deleted.
 */
export async function pruneExpiredEmailCodes(
  client: Pick<PrismaClient, 'emailCode'>,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - EXPIRED_CODE_RETENTION_MS)
  const { count } = await client.emailCode.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  })
  return count
}
