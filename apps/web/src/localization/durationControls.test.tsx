/** Localized option labels must retain minute-based values through the real controls. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import type { SnoozeInput } from '@persistent/shared'

const require = createRequire(import.meta.url)

test('Chinese duration and snooze choices keep stable unit identities and exact minute totals', async (context) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    DocumentFragment: dom.window.DocumentFragment,
    getComputedStyle: dom.window.getComputedStyle,
    React,
    IS_REACT_ACT_ENVIRONMENT: true
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  // Initialize Joy/Emotion after the document exists, with the app's CJS test interop.
  const { DurationField } = require('../components/DurationField.tsx') as typeof import('../components/DurationField.js')
  const { SnoozeDialog } = require('../components/SnoozeDialog.tsx') as typeof import('../components/SnoozeDialog.js')
  const { configureLocale, tr } = require('./i18n.ts') as typeof import('./i18n.js')
  const root = createRoot(document.getElementById('root')!)
  context.after(async () => {
    await act(async () => root.unmount())
    configureLocale('en-US', 'en-US')
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  configureLocale('zh-CN', 'zh-CN')

  /** Use the displayed choice, exercising Joy's actual option value handling. */
  async function chooseUnit(label: string) {
    const picker = document.querySelector('[role="combobox"]') as HTMLElement
    // JSDOM has no layout; give Popper an anchor while testing values rather than geometry.
    picker.parentElement!.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 120, 32)
    await act(async () => picker.click())
    const option = [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent === tr(label))
    assert.ok(option, `Missing translated unit: ${label}`)
    await act(async () => (option as HTMLElement).click())
  }

  await act(async () => root.render(<DurationField value={120} onChange={() => assert.fail('Changing display units must preserve the saved duration')} />))
  assert.equal(document.querySelector('[role="combobox"]')!.textContent, tr('hrs'))
  assert.equal((document.querySelector('input') as HTMLInputElement).value, '2')
  await chooseUnit('days')
  assert.equal((document.querySelector('input') as HTMLInputElement).value, '0.08')
  const amount = document.querySelector('input')
  await act(async () => configureLocale('de-DE', 'de-DE'))
  assert.equal(document.querySelector('input'), amount)
  assert.equal(document.querySelector('[role="combobox"]')!.textContent, tr('days'))
  await chooseUnit('hrs')
  assert.equal((amount as HTMLInputElement).value, '2')

  const snoozes: SnoozeInput[] = []
  await act(async () => {
    configureLocale('zh-CN', 'zh-CN')
    root.render(<SnoozeDialog open onClose={() => {}} onSnooze={(input) => snoozes.push(input)} />)
  })
  const custom = [...document.querySelectorAll('button')].find((node) => node.textContent === tr('Custom'))!
  await act(async () => custom.click())
  await chooseUnit('hrs')
  const snooze = [...document.querySelectorAll('button')].find((node) => node.textContent === tr('Snooze'))!
  await act(async () => snooze.click())
  assert.deepEqual(snoozes, [{ minutes: 2700 }])
})
