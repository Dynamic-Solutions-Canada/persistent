/** Live updates must preserve inline drafts and their original comparison text. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
const require = createRequire(import.meta.url)

for (const kind of ['title', 'body', 'item'] as const) {
  test(`${kind}: a concurrent edit sends the opening text and retains a rejected draft`, async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true })
    const previous = new Map<string, PropertyDescriptor | undefined>()
    for (const [key, value] of Object.entries({ React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
      Object.defineProperty(globalThis, key, { configurable: true, value })
    }
    const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
    const { InlineReminderText } = require('./InlineReminderText.tsx') as typeof import('./InlineReminderText.js')
    const { TodoItemText } = require('./TodoItemText.tsx') as typeof import('./TodoItemText.js')
    const { Simulate } = require('react-dom/test-utils') as typeof import('react-dom/test-utils')
    const root = createRoot(dom.window.document.getElementById('root')!)
    const saves: string[][] = []
    const save = async (text: string, expectedText: string) => {
      saves.push([text, expectedText])
      throw new Error('Changed by another editor. Your draft is kept.')
    }
    const render = async (text: string) => {
      await act(async () => root.render(kind === 'item'
        ? <TodoItemText text={text} struck={false} onRename={save} />
        : <InlineReminderText text={text} kind={kind} onSave={save} />))
    }
    const field = () => dom.window.document.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!
    try {
      await render('Original')
      await act(async () => (dom.window.document.querySelector('[role="button"]') as HTMLElement).click())
      await act(async () => Simulate.change(field(), { target: { value: 'My draft' } } as never))
      await render('Other editor saved this')
      assert.equal(field().value, 'My draft')
      await act(async () => Simulate.blur(field()))
      assert.deepEqual(saves, [['My draft', 'Original']])
      assert.equal(field().value, 'My draft')
      assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /draft is kept/)
      // A second blur must not silently retry the conflicting write.
      await act(async () => Simulate.blur(field()))
      assert.equal(saves.length, 1)
      await act(async () => Simulate.keyDown(field(), { key: 'Escape' }))
      assert.equal(dom.window.document.querySelector('input, textarea'), null)
      assert.match(dom.window.document.body.textContent!, /Other editor saved this/)
      // Simply opening a field must not turn a later live update into a local edit.
      await act(async () => (dom.window.document.querySelector('[role="button"]') as HTMLElement).click())
      await render('Another live update')
      await act(async () => Simulate.blur(field()))
      assert.equal(saves.length, 1)
      assert.match(dom.window.document.body.textContent!, /Another live update/)
    } finally {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    }
  })
}
