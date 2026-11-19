import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PROMOTED_APPS_CSP_SOURCE } from './content-security.js'

/**
 * The catalog URL the web app refreshes from, read from the promo submodule's source: importing
 * it would put a file outside the API's rootDir into its build.
 */
function catalogBaseUrl(): string {
  const source = readFileSync(
    new URL('../../../desktop/external/promo/catalog.ts', import.meta.url),
    'utf8',
  )
  const match = /CATALOG_BASE_URL\s*=\s*'([^']+)'/.exec(source)
  assert.ok(match, 'promo catalog.ts no longer declares CATALOG_BASE_URL')
  return match[1]!
}

test('the catalog the web refreshes sits under the CSP source, which names the repository path', () => {
  assert.ok(catalogBaseUrl().startsWith(PROMOTED_APPS_CSP_SOURCE))
  assert.notEqual(
    new URL(PROMOTED_APPS_CSP_SOURCE).pathname,
    '/',
    'the source must not allow the whole host',
  )
})

test('every response carries the catalog source in connect-src and img-src', async () => {
  const { createApp } = await import('../app.js')
  const server = createApp().listen(0)
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    const response = await fetch(`http://127.0.0.1:${port}/api/not-a-route`)
    const header = response.headers.get('content-security-policy') ?? ''
    const directive = (name: string) =>
      header
        .split(';')
        .map((part) => part.trim().split(/\s+/))
        .find(([key]) => key === name)
        ?.slice(1) ?? []
    assert.ok(directive('connect-src').includes(PROMOTED_APPS_CSP_SOURCE))
    assert.ok(directive('img-src').includes(PROMOTED_APPS_CSP_SOURCE))
    assert.ok(
      !directive('connect-src').includes('https://raw.githubusercontent.com'),
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
