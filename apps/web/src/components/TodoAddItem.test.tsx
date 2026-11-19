/** Checklist drafts survive blur and view dismissal without duplicate or empty additions. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'
import type { TodoItem } from '@persistent/shared'
const require = createRequire(import.meta.url)

for (const method of ['blur', 'close', 'enter', 'escape', 'empty'] as const) {
  test(`new checklist draft: ${method}`, async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
    const previous = new Map<string, PropertyDescriptor | undefined>()
    for (const [key, value] of Object.entries({
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      React,
      IS_REACT_ACT_ENVIRONMENT: true,
    })) {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value,
      })
    }
    // React DOM must discover the DOM before its first import.
    const { createRoot } =
      require('react-dom/client') as typeof import('react-dom/client')
    const { TodoAddItem } =
      require('./TodoAddItem.tsx') as typeof import('./TodoAddItem.js')
    // React 19 removed test-utils' Simulate; Testing Library dispatches real DOM events.
    const { fireEvent } =
      require('@testing-library/react') as typeof import('@testing-library/react')
    const items: TodoItem[] = []
    const root = createRoot(dom.window.document.getElementById('root')!)
    let mounted = true
    try {
      await act(async () =>
        root.render(<TodoAddItem onAdd={(item) => items.push(item)} />),
      )
      await act(async () =>
        (
          dom.window.document.querySelector('button') as HTMLButtonElement
        ).click(),
      )
      const input = dom.window.document.querySelector('input')!
      await act(async () =>
        fireEvent.change(input, {
          target: { value: method === 'empty' ? '   ' : '  Buy milk  ' },
        }),
      )
      if (method === 'blur' || method === 'empty')
        await act(async () => fireEvent.blur(input))
      if (method === 'enter')
        await act(async () => fireEvent.keyDown(input, { key: 'Enter' }))
      if (method === 'escape')
        await act(async () => fireEvent.keyDown(input, { key: 'Escape' }))
      await act(async () => root.unmount())
      mounted = false
      assert.deepEqual(
        items.map((item) => item.text),
        method === 'escape' || method === 'empty' ? [] : ['Buy milk'],
      )
      if (items.length) assert.ok(items[0]!.id)
    } finally {
      if (mounted) await act(async () => root.unmount())
      dom.window.close()
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    }
  })
}
