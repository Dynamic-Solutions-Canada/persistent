import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptedLanguages, requestLocale } from './request-locale.js'

test('HTTP negotiation respects quality weights, stable ordering and explicit rejection', () => {
  assert.deepEqual(acceptedLanguages('de-DE;q=0, en-CA;q=0.5, fr-CA;q=0.9, ja;q=0.9'), ['fr-CA', 'ja', 'en-CA'])
  assert.deepEqual(acceptedLanguages('en;q=NaN, fr;q=2, ja;q=-1, pt-BR'), ['pt-BR'])
  const request = { query: {}, get: (name: string) => name === 'Accept-Language' ? 'zh-Hant-CN, fr-FR;q=0.9, en;q=0' : undefined }
  assert.equal(requestLocale(request as never), 'fr-FR')
})
