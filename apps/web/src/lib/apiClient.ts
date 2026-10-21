/**
 * Thin fetch wrapper for JSON endpoints. Sends cookies by default, throws a typed
 * ApiError on non-2xx, and parses the JSON body. Use this instead of bare fetch.
 * Public external requests must explicitly set credentials to 'omit'.
 */
import { LOCALE_HEADER } from '@persistent/shared'
import { extractErrorMessage } from '../localization/errorMessage.js'
import { getLocale } from '../localization/localeState.js'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Public promo requests can be cross-origin and must carry no device metadata.
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const sameOrigin = isSameOriginRequest(path)
  if (sameOrigin && options.credentials !== 'omit') headers.set(LOCALE_HEADER, getLocale())
  else headers.delete(LOCALE_HEADER)
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers
  })

  const text = await response.text()
  const body = text ? safeParse(text) : null

  if (!response.ok) {
    throw new ApiError(response.status, extractErrorMessage(localizedErrorBody(body), `Request failed (${response.status}).`))
  }
  return body as T
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Prefer the additive localized message, retaining compatibility with English-only servers. */
function localizedErrorBody(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const body = value as { message?: unknown; code?: unknown }
  return typeof body.code === 'string' && typeof body.message === 'string' ? body.message : value
}

/** Canonical URL parsing also rejects slash/backslash URLs that browsers interpret as another origin. */
export function isSameOriginRequest(path: string): boolean {
  if (typeof window === 'undefined') return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
  try {
    return new URL(path, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}
