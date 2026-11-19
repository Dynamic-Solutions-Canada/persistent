/**
 * Builds a Prisma 7 client connected through the pg driver adapter. The API's singleton
 * (`lib/prisma.ts`) and the dev scripts (seeds, store assets) all construct clients here, so the
 * pool limits and log redaction live in one place.
 *
 * Pool: Prisma 7 no longer manages connections itself; pg's pool does. Its limits are set
 * explicitly because pg's defaults would wait forever for a free connection. Ten connections is
 * ample for one API process and keeps the API plus the scheduler well under Postgres's
 * `max_connections`; a query that cannot get a connection within ten seconds fails, as Prisma 6's
 * `pool_timeout` did.
 *
 * Logs: Prisma 7 prints a validation error's whole invocation, argument values included (an
 * email address, a reminder's text), whenever the `error` level is enabled; Prisma 6 did not.
 * Every level is therefore taken as an event and passed on with only the message's first line,
 * which names the failed call but carries no values.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Prisma } from '../generated/prisma/client.js'

/** Most connections one client's pool opens. */
const POOL_MAX = 10
/** How long a query waits for a free connection before failing, in milliseconds. */
const POOL_WAIT_MS = 10_000

/** Where a client's log lines go: the API passes its logger, scripts use the console. */
export type PrismaLogSink = (
  level: Prisma.LogLevel,
  message: string,
  fields: { target: string },
) => void

/** The console, prefixed the way Prisma prints its own lines. */
const consoleSink: PrismaLogSink = (level, message, fields) => {
  const line = `prisma:${level} ${message} ${JSON.stringify(fields)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/**
 * The part of a Prisma log message that is safe to keep: its first non-empty line, such as
 * "Invalid `prisma.user.create()` invocation:". The lines after it can repeat the call's
 * arguments, so they are dropped.
 */
export function redactPrismaLogMessage(message: string): string {
  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  return firstLine ?? '(empty Prisma log message)'
}

/**
 * A new client for `connectionString`.
 *
 * @param connectionString The Postgres URL (DATABASE_URL). Prisma 7 no longer reads it from the
 *   environment itself, so an empty value is refused here rather than letting pg fall back to a
 *   default local connection.
 * @param log Prisma's log levels to report; defaults to errors only.
 * @param sink Where the redacted lines go; defaults to the console.
 */
export function createPrismaClient(
  connectionString: string,
  log: Prisma.LogLevel[] = ['error'],
  sink: PrismaLogSink = consoleSink,
): PrismaClient {
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: POOL_MAX,
      connectionTimeoutMillis: POOL_WAIT_MS,
    }),
    log: log.map((level) => ({ emit: 'event' as const, level })),
  })

  // Forward each enabled level through the redaction above, never Prisma's own printout.
  for (const level of log) {
    client.$on(level as never, (event: Prisma.LogEvent) => {
      sink(level, redactPrismaLogMessage(event.message), {
        target: event.target,
      })
    })
  }
  return client
}
