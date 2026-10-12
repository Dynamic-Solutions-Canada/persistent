/** Native Snooze must wait for fresh account data and preserve a draft on the underlying screen. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
const require = createRequire(import.meta.url)

test('Linux notification opens the existing full picker after freshness, keeps the draft, and snoozes only its occurrence', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true })
  const previous = new Map<string, PropertyDescriptor | undefined>()
  const values = {
    React, window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
    DocumentFragment: dom.window.DocumentFragment, IS_REACT_ACT_ENVIRONMENT: true
  }
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  // Match the CommonJS Joy default-export convention used by existing component tests.
  const { DesktopNotificationSnooze } = require('./DesktopNotificationSnooze.tsx') as typeof import('./DesktopNotificationSnooze.js')
  const { StartupDataContext } = require('../components/startupDataContext.ts') as typeof import('../components/startupDataContext.js')
  const { queryKeys, mutationKeys } = require('../lib/queryClient.ts') as typeof import('../lib/queryClient.js')
  const { QueryClient, QueryClientProvider } = require('@tanstack/react-query') as typeof import('@tanstack/react-query')
  const listeners = new Set<(event: { data: unknown }) => void>()
  const hostMessages: unknown[] = []
  window.persistentDesktop = {
    platform: 'linux', postMessage: (message) => hostMessages.push(message),
    addEventListener: (_type, listener) => { listeners.add(listener) },
    removeEventListener: (_type, listener) => { listeners.delete(listener) }
  }
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity, retry: false } } })
  client.setQueryData(queryKeys.occurrencesActive, [{ id: 'synthetic-firing', reminder: { title: 'Synthetic reminder' } }])
  const writes: unknown[] = []
  client.setMutationDefaults(mutationKeys.snoozeOccurrence, { mutationFn: async (input) => { writes.push(input) } })
  const root = createRoot(dom.window.document.getElementById('root')!)
  const render = (ready: boolean) => (
    <QueryClientProvider client={client}>
      <StartupDataContext.Provider value={ready}>
        <input aria-label="Existing draft" defaultValue="Unsent reminder draft" />
        <DesktopNotificationSnooze />
      </StartupDataContext.Provider>
    </QueryClientProvider>
  )
  try {
    await act(async () => root.render(render(false)))
    assert.deepEqual(hostMessages, [{ type: 'notificationActionsReady' }])
    await act(async () => {
      for (const listener of listeners) listener({ data: { type: 'snoozeOccurrence', occurrenceId: 'synthetic-firing' } })
    })
    assert.doesNotMatch(dom.window.document.body.textContent ?? '', /Snooze Synthetic reminder/)
    const draft = dom.window.document.querySelector<HTMLInputElement>('[aria-label="Existing draft"]')!
    await act(async () => root.render(render(true)))
    assert.equal(dom.window.document.querySelector('[aria-label="Existing draft"]'), draft)
    assert.equal(draft.value, 'Unsent reminder draft')
    assert.match(dom.window.document.body.textContent ?? '', /Snooze Synthetic reminder/)
    assert.match(dom.window.document.body.textContent ?? '', /Custom/)
    assert.match(dom.window.document.body.textContent ?? '', /Until/)
    const preset = [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent === '15 min')!
    await act(async () => preset.click())
    assert.deepEqual(writes, [{ id: 'synthetic-firing', arg: { minutes: 15 } }])
  } finally {
    await act(async () => root.unmount())
    client.clear()
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
