/** Checklist drafts survive blur and view dismissal without duplicate or empty additions. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'
import type { TodoItem } from '@persistent/shared'
const require = createRequire(import.meta.url)

for (const method of ['blur', 'close', 'enter', 'escape', 'empty'] as const) {
  test(`new checklist draft: ${method}`, async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
    const previous = new Map<string, PropertyDescriptor | undefined>()
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, React, IS_REACT_ACT_ENVIRONMENT: true })) {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
      Object.defineProperty(globalThis, key, { configurable: true, value })
    }
    const { TodoAddItem } = require('./TodoAddItem.tsx') as typeof import('./TodoAddItem.js')
    const { Simulate } = require('react-dom/test-utils') as typeof import('react-dom/test-utils')
    const items: TodoItem[] = []
    const root = createRoot(dom.window.document.getElementById('root')!)
    let mounted = true
    try {
      await act(async () => root.render(<TodoAddItem onAdd={(item) => items.push(item)} />))
      await act(async () => (dom.window.document.querySelector('button') as HTMLButtonElement).click())
      const input = dom.window.document.querySelector('input')!
      await act(async () => Simulate.change(input, { target: { value: method === 'empty' ? '   ' : '  Buy milk  ' } } as never))
      if (method === 'blur' || method === 'empty') await act(async () => Simulate.blur(input))
      if (method === 'enter') await act(async () => Simulate.keyDown(input, { key: 'Enter' }))
      if (method === 'escape') await act(async () => Simulate.keyDown(input, { key: 'Escape' }))
      await act(async () => root.unmount())
      mounted = false
      assert.deepEqual(items.map((item) => item.text), method === 'escape' || method === 'empty' ? [] : ['Buy milk'])
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
