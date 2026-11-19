/** Database-owned admin grants, checked afresh before any aggregate cross-user read. */
import type { Request } from 'express'
import { prisma } from './prisma.js'
import { requireUserId } from './auth-middleware.js'
import { forbidden } from './http-error.js'
import { env } from './env.js'

/**
 * Whether a newly created, verified account starts as an administrator: its address is one of
 * the configured initial administrators (ADMIN_EMAILS). Called only at account creation, so a
 * later database revocation sticks and no sign-in re-grants it.
 * @param administrators normalised addresses; defaults to ADMIN_EMAILS
 */
export function initialAdminGrant(
  verifiedEmail: string,
  administrators: readonly string[] = env.ADMIN_EMAILS ?? [],
): boolean {
  return administrators.includes(verifiedEmail.trim().toLowerCase())
}

/** Reject anonymous and ordinary accounts before querying cross-user statistics. */
export async function requireAdmin(request: Request): Promise<string> {
  const userId = requireUserId(request)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  })
  if (!user?.isAdmin) throw forbidden('Administrator access required.')
  return userId
}
