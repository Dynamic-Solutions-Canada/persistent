/** URL policy used by hosted windows and every privileged bridge call. */
export function serverOrigin(value: string): string {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Use HTTPS, or HTTP on localhost for development')
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter only the server origin, without a path or credentials')
  return url.origin
}

export function isAppUrl(value: string, origin: string): boolean {
  try { const url = new URL(value); return url.origin === origin && !url.username && !url.password } catch { return false }
}

/** Only HTTPS browser links can leave the host. No arbitrary OS protocol execution. */
export function isExternalUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password } catch { return false }
}

export function isGoogleSignIn(value: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === 'https://accounts.google.com' && !url.username && !url.password
  } catch { return false }
}

/** Keep app and Google authentication navigation in the managed views. */
export function externalLinkIntent(trusted: boolean, href: string, server: string): string | null {
  if (!trusted || !isExternalUrl(href)) return null
  const origin = new URL(href).origin
  if (origin === server || origin === 'https://accounts.google.com') return null
  return href
}
