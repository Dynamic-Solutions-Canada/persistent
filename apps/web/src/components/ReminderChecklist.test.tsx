/** Actual reading controls must toggle received progress without opening the editor. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import type { SharedReminder } from '@persistent/shared'

const require = createRequire(import.meta.url)
const { ReminderChecklist } = require('./ReminderChecklist.tsx') as typeof import('./ReminderChecklist.js')
const { queryClient, queryKeys, registerMutationDefaults } = require('../lib/queryClient.ts') as typeof import('../lib/queryClient.js')
const { QueryClientProvider, useQuery } = require('@tanstack/react-query') as typeof import('@tanstack/react-query')

for (const note of [true, false]) {
  test(`received ${note ? 'note' : 'firing'} can check and uncheck in the reading view`, async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
    const previous = new Map<string, PropertyDescriptor | undefined>()
    const requests: string[] = []
    for (const [key, value] of Object.entries({
      React, window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
      fetch: async (url: string) => {
        requests.push(url)
        return new Response('{}', { status: 200 })
      }
    })) {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
      Object.defineProperty(globalThis, key, { configurable: true, value })
    }
    const definition = { id: 'shared', typeData: { items: [{ id: 'item', text: 'Milk' }] }, checkedItemIds: [], hideCheckedItems: false }
    const share = {
      ...definition, isNote: note, editableReminder: definition,
      activeFirings: note ? [] : [{ id: 'firing', checkedItemIds: [] }]
    } as unknown as SharedReminder
    queryClient.clear()
    registerMutationDefaults()
    queryClient.setQueryData(queryKeys.receivedShares, [share])
    function ReadingView() {
      const { data } = useQuery<SharedReminder[]>({ queryKey: queryKeys.receivedShares, enabled: false })
      const current = data![0]!
      return <ReminderChecklist
        reminder={{ ...current, hideCheckedItems: current.editableReminder!.hideCheckedItems }}
        isNote={note}
        firing={current.activeFirings[0]}
      />
    }
    const root = createRoot(dom.window.document.getElementById('root')!)
    try {
      await act(async () => root.render(<QueryClientProvider client={queryClient}><ReadingView /></QueryClientProvider>))
      const checkbox = () => dom.window.document.querySelector<HTMLInputElement>('input[type="checkbox"]')!
      assert.equal(checkbox().disabled, false)
      await act(async () => { checkbox().click(); await new Promise((resolve) => setTimeout(resolve, 20)) })
      assert.equal(checkbox().checked, true)
      assert.match(dom.window.document.body.textContent!, note ? /All 1 checked/ : /tap Done to confirm/)
      await act(async () => { checkbox().click(); await new Promise((resolve) => setTimeout(resolve, 20)) })
      assert.equal(checkbox().checked, false)
      assert.deepEqual(requests, Array(2).fill(note ? '/api/reminders/shared/check' : '/api/occurrences/firing/check'))
    } finally {
      await act(async () => root.unmount())
      queryClient.clear()
      dom.window.close()
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    }
  })
}
