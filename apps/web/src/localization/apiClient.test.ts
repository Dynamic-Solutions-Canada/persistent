import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apiFetch, ApiError } from '../lib/apiClient.js'
import { configureLocale } from './i18n.js'

test('only authenticated same-origin requests carry device locale and old error wires remain readable', async (context) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: 'https://persistent.test/settings', origin: 'https://persistent.test' } } })
  const calls: { path: string; options: RequestInit }[] = []
  let responseBody: unknown = {}
  let status = 200
  globalThis.fetch = async (path, options) => {
    calls.push({ path: String(path), options: options! })
    return new Response(JSON.stringify(responseBody), { status })
  }
  context.after(() => {
    globalThis.fetch = previousFetch
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    configureLocale('en-US', 'en-US')
  })
  configureLocale('fr-CA', 'en-CA')
  await apiFetch('/api/auth/me', { headers: new Headers({ 'X-Test': 'kept' }) })
  const headers = new Headers(calls[0]!.options.headers)
  assert.equal(headers.get('X-Persistent-Locale'), 'fr-CA')
  assert.equal(headers.get('X-Test'), 'kept')
  for (const path of ['https://promo.test/catalog', '//promo.test/catalog', '/\\promo.test/catalog']) {
    await apiFetch(path, { credentials: 'omit', headers: { 'X-Persistent-Locale': 'de-DE' } })
    assert.equal(new Headers(calls.at(-1)!.options.headers).has('X-Persistent-Locale'), false)
  }
  await apiFetch('/public/catalog', { credentials: 'omit' })
  assert.equal(new Headers(calls.at(-1)!.options.headers).has('X-Persistent-Locale'), false)
  status = 404
  responseBody = { error: 'Reminder not found.' }
  await assert.rejects(apiFetch('/api/reminders/missing'), (error: unknown) => error instanceof ApiError && error.status === 404 && error.message === 'Rappel introuvable.')
  responseBody = { error: 'Reminder not found.', code: 'error.reminder-not-found', message: 'Rappel introuvable.' }
  await assert.rejects(apiFetch('/api/reminders/missing'), /Rappel introuvable\./)
})
