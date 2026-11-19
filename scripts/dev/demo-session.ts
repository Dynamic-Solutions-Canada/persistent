/**
 * A reusable sign-in for the development demo account, written as a Playwright storageState file.
 *
 * Browser and device checks used to sign in afresh on every run, and sign-in codes are rate limited
 * (five per address and twelve per IP address in fifteen minutes), so a busy check session locked
 * itself out. This signs `demo@example.test` in once and saves the session cookie; later runs reuse
 * the file while the server still accepts it, and request a new code only when it does not.
 *
 * Usage: `npm run dev:session -- --origin=http://localhost:<web port>` (optionally `--out=<path>`,
 * default `tmp/dev-session/demo.json`, which is git-ignored). Pass the file to Playwright as
 * `browser.newContext({ storageState })`.
 *
 * Only a local origin and only the demo account are accepted, and demo mode must be on (the dev
 * stack forces it), because the code comes back in the response. The cookie value is a session
 * secret: it is written only to the state file and never printed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DEMO_EMAIL = 'demo@example.test'
const DEFAULT_OUT = 'tmp/dev-session/demo.json'

/** SameSite values as Playwright spells them; anything else is treated as Lax, the browser default. */
const SAME_SITE: Record<string, StorageCookie['sameSite']> = {
  strict: 'Strict',
  lax: 'Lax',
  none: 'None',
}

/** A cookie in Playwright's storageState shape. */
export interface StorageCookie {
  name: string
  value: string
  domain: string
  path: string
  /** Unix seconds, or -1 for a session cookie. */
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

/**
 * Convert one `Set-Cookie` header into a storageState cookie for `host`.
 *
 * @param header The raw header value, for example `name=value; Path=/; Max-Age=60; HttpOnly`.
 * @param host The origin's hostname, used as the cookie domain when the header names none.
 * @param nowMs The current time, so `Max-Age` becomes an absolute expiry; a parameter for tests.
 * @returns The cookie, or null when the header has no `name=value` pair.
 */
export function toStorageCookie(
  header: string,
  host: string,
  nowMs: number = Date.now(),
): StorageCookie | null {
  const [pair, ...attributes] = header.split(';').map((part) => part.trim())
  const equals = pair?.indexOf('=') ?? -1
  if (!pair || equals <= 0) return null

  const cookie: StorageCookie = {
    name: pair.slice(0, equals),
    value: pair.slice(equals + 1),
    domain: host,
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }

  // Apply the attributes the browser would honour; Max-Age wins over Expires, as in RFC 6265.
  let maxAge: number | null = null
  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split('=')
    const key = rawKey?.toLowerCase()
    const value = rest.join('=')
    if (key === 'path' && value) cookie.path = value
    else if (key === 'domain' && value) cookie.domain = value.replace(/^\./, '')
    else if (key === 'httponly') cookie.httpOnly = true
    else if (key === 'secure') cookie.secure = true
    else if (key === 'max-age') maxAge = Number(value)
    else if (key === 'expires' && cookie.expires === -1) {
      const at = Date.parse(value)
      if (!Number.isNaN(at)) cookie.expires = Math.floor(at / 1000)
    } else if (key === 'samesite') {
      cookie.sameSite = SAME_SITE[value.toLowerCase()] ?? 'Lax'
    }
  }
  if (maxAge !== null && Number.isFinite(maxAge))
    cookie.expires = Math.floor(nowMs / 1000) + maxAge
  return cookie
}

/** Read `--name=value` from the command line. */
function argument(name: string): string | undefined {
  return process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
}

/** The origin to sign in against, refused unless it is this machine's dev server. */
function localOrigin(): URL {
  const raw = argument('origin')
  if (!raw)
    throw new Error(
      'Pass --origin=http://localhost:<web port> (the dev web server).',
    )
  const origin = new URL(raw)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
    throw new Error(
      'Refusing a non-local origin: this signs in with a demo-mode code.',
    )
  return origin
}

/** Whether the saved state's cookies still open a session on `origin`. */
async function savedSessionWorks(origin: URL, path: string): Promise<boolean> {
  if (!existsSync(path)) return false
  const state = JSON.parse(readFileSync(path, 'utf8')) as {
    cookies?: StorageCookie[]
  }
  const header = (state.cookies ?? [])
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
  if (!header) return false
  const response = await fetch(new URL('/api/auth/me', origin), {
    headers: { cookie: header },
  })
  return response.ok
}

/** POST JSON to the dev API and return the response. */
function post(origin: URL, path: string, body: unknown): Promise<Response> {
  return fetch(new URL(path, origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Sign the demo account in with a demo-mode code and return its cookies. */
async function signIn(origin: URL): Promise<StorageCookie[]> {
  const requested = await post(origin, '/api/auth/request-code', {
    email: DEMO_EMAIL,
  })
  if (!requested.ok)
    throw new Error(
      `Requesting a sign-in code failed (HTTP ${requested.status}); codes are limited to five per address in fifteen minutes.`,
    )
  const { previewCode } = (await requested.json()) as {
    previewCode: string | null
  }
  if (!previewCode)
    throw new Error(
      'The server did not return a code: demo mode is off. Use the dev stack (npm run dev).',
    )

  const verified = await post(origin, '/api/auth/verify-code', {
    email: DEMO_EMAIL,
    code: previewCode,
  })
  if (!verified.ok)
    throw new Error(`Verifying the code failed (HTTP ${verified.status}).`)
  const cookies = verified.headers
    .getSetCookie()
    .map((header) => toStorageCookie(header, origin.hostname))
    .filter((cookie): cookie is StorageCookie => cookie !== null)
  if (cookies.length === 0)
    throw new Error('Signing in returned no session cookie.')
  return cookies
}

/** Reuse the saved session when it still works; otherwise sign in once and save it. */
async function main(): Promise<void> {
  const origin = localOrigin()
  const out = resolve(argument('out') ?? DEFAULT_OUT)

  if (await savedSessionWorks(origin, out)) {
    console.log(`Reusing the saved demo session: ${out}`)
    return
  }

  const cookies = await signIn(origin)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ cookies, origins: [] }, null, 2), {
    mode: 0o600,
  })
  console.log(`Signed in ${DEMO_EMAIL} and saved the session: ${out}`)
}

// Run only as a script, so the test can import the cookie conversion.
if (import.meta.main) await main()
