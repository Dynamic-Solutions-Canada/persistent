/**
 * Unit tests for the web fallback's miss path: a path that names a file is a `no-store` 404,
 * while every extensionless client-side route still reaches the app shell.
 */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import express from 'express'
import { looksLikeFilePath, sendMissingFile } from './missing-file.js'

test('a path names a file only when its last segment has an extension', () => {
  assert.equal(looksLikeFilePath('/icon-192.png'), true)
  assert.equal(looksLikeFilePath('/assets/gone-9z9z.js'), true)
  assert.equal(looksLikeFilePath('/'), false)
  assert.equal(looksLikeFilePath('/settings'), false)
  // A dot elsewhere, or a trailing dot left by punctuation after a pasted link, is still a route.
  assert.equal(looksLikeFilePath('/v1.2/settings'), false)
  assert.equal(looksLikeFilePath('/settings.'), false)
})

test('a missing file is an uncached 404, a route still gets the shell', async (context) => {
  const app = express()
  app.get('/{*path}', (request, response) => {
    if (looksLikeFilePath(request.path)) {
      sendMissingFile(response)
      return
    }

    response.send('shell')
  })
  const server = app.listen(0)
  context.after(() => server.close())
  const { port } = server.address() as AddressInfo
  const get = (urlPath: string) => fetch(`http://127.0.0.1:${port}${urlPath}`)

  const missing = await get('/assets/gone-9z9z.js')
  assert.equal(missing.status, 404)
  assert.equal(await missing.text(), '')
  assert.equal(missing.headers.get('cache-control'), 'no-store')

  const route = await get('/settings')
  assert.equal(route.status, 200)
  assert.equal(await route.text(), 'shell')
})
