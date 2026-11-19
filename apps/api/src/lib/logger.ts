/**
 * Minimal structured logger. Keeps a consistent shape without pulling in a
 * logging framework; swap the sink here if we later want JSON/transport output.
 */
type Fields = Record<string, unknown>

function emit(
  level: 'info' | 'warn' | 'error',
  message: string,
  fields?: Fields,
): void {
  const line =
    fields && Object.keys(fields).length > 0
      ? `${message} ${JSON.stringify(fields)}`
      : message
  if (level === 'error') console.error(`[${level}] ${line}`)
  else if (level === 'warn') console.warn(`[${level}] ${line}`)
  else console.log(`[${level}] ${line}`)
}

export const logger = {
  info: (message: string, fields?: Fields) => emit('info', message, fields),
  warn: (message: string, fields?: Fields) => emit('warn', message, fields),
  error: (message: string, fields?: Fields) => emit('error', message, fields),
}

export type Logger = typeof logger

/** What a log line may say about an error without carrying the data it was raised with. */
export type ErrorSummary = {
  /** The error's class, for example `PrismaClientValidationError` or `TypeError`. */
  name: string
  /** A library's error code when it has one, for example Prisma's `P2002`. */
  code?: string
  /** The first stack frame, to find where it was thrown. */
  at?: string
}

/**
 * The parts of an error that are safe to log. An error's message can carry the values it was
 * raised with: a Prisma validation error repeats the call's arguments (an email address, a
 * reminder's text), and a JSON parse error can quote the request body. So the message is left out
 * and only the class, any code and the throwing frame are kept.
 */
export function describeError(error: unknown): ErrorSummary {
  if (!(error instanceof Error)) return { name: typeof error }

  const summary: ErrorSummary = { name: error.constructor.name || error.name }
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' || typeof code === 'number')
    summary.code = String(code)
  const frame = error.stack
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at '))
  if (frame) summary.at = frame.slice(3)
  return summary
}
