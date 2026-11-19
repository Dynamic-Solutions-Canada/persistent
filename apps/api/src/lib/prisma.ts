/**
 * Singleton Prisma client. Import `prisma` from here in all feature code.
 *
 * Unlike printstream there is no tenant-scoping extension: ownership is plain
 * per-user, enforced by always including `{ userId }` in `where` clauses. That
 * single rule is the data-isolation boundary — see docs/backend-conventions.md.
 *
 * The client, its connection pool and its redacted logging are built by
 * `createPrismaClient`; Prisma's lines go through the API logger. Outside
 * production it is kept on `globalThis`, so a dev reload reuses its pool.
 */
import type { PrismaClient } from '../generated/prisma/client.js'
import { env } from './env.js'
import { logger } from './logger.js'
import { createPrismaClient } from './prisma-client.js'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient(
    env.DATABASE_URL,
    env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    (level, message, fields) => {
      if (level === 'error') logger.error(`prisma: ${message}`, fields)
      else logger.warn(`prisma: ${message}`, fields)
    },
  )

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
