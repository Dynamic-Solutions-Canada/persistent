import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
const { analyticsCspSources, getClientAnalyticsConfig } =
  await import('./analytics.js')

const on = {
  CLIENT_ORIGIN:
    'https://persistent.dynamic-solutions.ca,http://localhost:5173',
  UMAMI_SCRIPT_URL: 'https://analytics.dynamic-solutions.ca/script.js',
  UMAMI_WEBSITE_ID: 'b3ce5e5e-f64c-4bb6-b90c-95c85f994d10',
}

test('analytics is on only when both settings are present', () => {
  assert.deepEqual(getClientAnalyticsConfig(on), {
    scriptUrl: 'https://analytics.dynamic-solutions.ca/script.js',
    websiteId: 'b3ce5e5e-f64c-4bb6-b90c-95c85f994d10',
    domains: ['persistent.dynamic-solutions.ca'],
  })
  assert.equal(
    getClientAnalyticsConfig({ ...on, UMAMI_WEBSITE_ID: undefined }),
    null,
  )
  assert.equal(
    getClientAnalyticsConfig({ ...on, UMAMI_SCRIPT_URL: undefined }),
    null,
  )
})

test('the CSP names the tracker origin only when analytics is on', () => {
  assert.deepEqual(analyticsCspSources(on), [
    'https://analytics.dynamic-solutions.ca',
  ])
  assert.deepEqual(analyticsCspSources({ CLIENT_ORIGIN: on.CLIENT_ORIGIN }), [])
})
