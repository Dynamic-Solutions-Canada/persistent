/** Exercise the real admin chart's metric, period and accessible date controls with synthetic aggregates. */
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { createRequire } from 'node:module'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { adminUserGrowthSchema } from '@persistent/shared'

// Emotion and React DOM must discover the DOM before their first import.
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
const previous = new Map<string, PropertyDescriptor | undefined>()
for (const [key, value] of Object.entries({
  React, window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node, Element: dom.window.Element, getComputedStyle: dom.window.getComputedStyle,
  IS_REACT_ACT_ENVIRONMENT: true
})) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
}
after(() => {
  dom.window.close()
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

const require = createRequire(import.meta.url)
const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { UserGrowthChart } = require('./UserGrowthChart.tsx') as typeof import('./UserGrowthChart.js')
const { UserGrowthPlot } = require('./UserGrowthPlot.tsx') as typeof import('./UserGrowthPlot.js')
const { UserMetricCards } = require('./UserMetricCards.tsx') as typeof import('./UserMetricCards.js')
const { fireEvent } = require('@testing-library/react') as typeof import('@testing-library/react')

test('growth schema accepts only bounded aggregate counts and valid calendar dates', () => {
  const valid = { days: 30, timeZone: 'America/Toronto', points: [{ date: '2026-11-01', total: 8, signups: 2 }] }
  assert.ok(adminUserGrowthSchema.safeParse(valid).success)
  assert.equal(adminUserGrowthSchema.safeParse({ ...valid, days: 10000 }).success, false)
  assert.equal(adminUserGrowthSchema.safeParse({ ...valid, points: [{ date: 'not-a-date', total: 1, signups: 0 }] }).success, false)
  assert.equal(adminUserGrowthSchema.safeParse({ ...valid, points: [{ date: '2026-11-01', total: -1, signups: 0 }] }).success, false)
})

test('chart switches metric, requests the growth period and explores exact daily counts', async () => {
  const root = createRoot(dom.window.document.getElementById('root')!)
  const requested: number[] = []
  const points = [
    { date: '2026-11-01', total: 8, signups: 2 },
    { date: '2026-11-02', total: 8, signups: 0 },
    { date: '2026-11-03', total: 11, signups: 3 }
  ]
  try {
    await act(async () => root.render(<UserGrowthChart growth={{ days: 90, timeZone: 'America/Toronto', points }} days={90} onDaysChange={(days) => requested.push(days)} />))
    const document = dom.window.document
    assert.match(document.querySelector('svg[role="img"]')!.getAttribute('aria-label')!, /Total users/)
    assert.match(document.querySelector('[aria-live]')!.textContent!, /11 total users, 3 sign-ups/)
    const selects = document.querySelectorAll('[role="combobox"]')
    await act(async () => fireEvent.click(selects[1]!))
    const option = [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent === 'Daily sign-ups')!
    await act(async () => fireEvent.click(option))
    assert.match(document.querySelector('svg[role="img"]')!.getAttribute('aria-label')!, /Daily sign-ups/)
    assert.equal(document.querySelectorAll('svg[role="img"] rect').length, 3)

    await act(async () => fireEvent.change(document.querySelector('input[type="range"]')!, { target: { value: '0' } }))
    assert.match(document.querySelector('[aria-live]')!.textContent!, /8 total users, 2 sign-ups/)
    await act(async () => fireEvent.click(selects[0]!))
    const period = [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent === 'Last 30 days')!
    await act(async () => fireEvent.click(period))
    assert.deepEqual(requested, [30])
    assert.match(document.querySelector('table')!.textContent!, /Total users/)
    assert.match(document.body.textContent!, /deleted accounts are excluded/)

    // A slow period response masks the old data without replacing the chart or
    // removing its height. Controls keep the requested period visible.
    const chart = document.querySelector('svg[role="img"]')
    await act(async () => root.render(<UserGrowthChart growth={{ days: 90, timeZone: 'America/Toronto', points }}
      days={30} loading onDaysChange={(days) => requested.push(days)} />))
    assert.equal(document.querySelector('svg[role="img"]'), chart)
    assert.equal(chart!.closest('[aria-hidden]')!.getAttribute('aria-hidden'), 'true')
    assert.ok(document.querySelector('[role="status"][aria-label="Loading user growth"]'))
    assert.equal(document.querySelector('input[type="range"]')!.hasAttribute('disabled'), true)
    assert.equal(document.querySelectorAll('[role="combobox"]')[0]!.textContent, 'Last 30 days')
    await act(async () => root.render(<UserGrowthChart growth={{ days: 30, timeZone: 'America/Toronto', points }}
      days={30} onDaysChange={(days) => requested.push(days)} />))
    assert.equal(document.querySelector('svg[role="img"]'), chart)
    assert.equal(chart!.closest('[aria-hidden]')!.getAttribute('aria-hidden'), 'false')
  } finally {
    await act(async () => root.unmount())
  }
})

test('initial loading uses real metric labels and a chart skeleton without fabricated data', () => {
  const metrics = renderToStaticMarkup(<UserMetricCards users={undefined} activeDays={30} loading />)
  assert.match(metrics, /Registered users/)
  assert.match(metrics, /aria-busy="true"/)
  const chart = renderToStaticMarkup(<UserGrowthChart days={90} loading onDaysChange={() => {}} />)
  assert.match(chart, /Loading user growth/)
  assert.match(chart, /MuiSkeleton-variantOverlay/)
  const skeletonDom = new JSDOM(chart)
  assert.equal(skeletonDom.window.document.querySelector('svg[role="img"]')!.closest('[aria-hidden]')!.getAttribute('aria-hidden'), 'true')
  skeletonDom.window.close()
  assert.doesNotMatch(chart, /NaN|Infinity/)
})

test('empty, zero and single-point plots have finite geometry', () => {
  for (const points of [[], [{ date: '2026-03-08', signups: 0, total: 0 }]]) {
    for (const metric of ['total', 'signups'] as const) {
      const markup = renderToStaticMarkup(<UserGrowthPlot points={points} metric={metric} selectedIndex={0} onSelect={() => {}} />)
      assert.doesNotMatch(markup, /NaN|Infinity/)
      assert.match(markup, /role="img"/)
    }
  }
})
