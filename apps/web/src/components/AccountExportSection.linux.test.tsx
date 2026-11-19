/**
 * "Download my data" in the Linux app: the browser link appears only once the host's settings
 * report `exportInBrowser`; an older AppImage, which never sends it, keeps the instruction line,
 * because its host would open the link in an in-app window rather than the browser.
 * Kept apart from the Android tests: @capacitor/core fixes its platform once per process.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
const require = createRequire(import.meta.url)

/** A host settings payload from a Linux host, with or without the export capability. */
function linuxSettings(exportInBrowser: boolean) {
  return {
    platform: 'linux',
    snoozeInApp: true,
    ...(exportInBrowser ? { exportInBrowser: true } : {}),
    notifications: true,
    snoozeMinutes: 15,
    snoozeChoices: [{ minutes: 15, label: '15 min' }],
    pinFlyout: false,
    startAtSignIn: false,
    flyoutSize: 'default',
    flyoutSizes: [{ id: 'default', label: 'Default', width: 420, height: 760 }],
  }
}

/**
 * Render the section in a Linux host that answers `getHostSettings` with [settings], and
 * return the section's link target (or null) and its text.
 */
async function renderInLinux(
  settings: unknown,
): Promise<{ href: string | null; text: string }> {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://persistent.example/settings',
    pretendToBeVisual: true,
  })
  const previous = new Map<string, PropertyDescriptor | undefined>()
  const values = {
    React,
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    DocumentFragment: dom.window.DocumentFragment,
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    })
  }
  const listeners = new Set<(event: { data: unknown }) => void>()
  window.persistentDesktop = {
    platform: 'linux',
    postMessage: (message) => {
      if ((message as { type?: string }).type !== 'getHostSettings') return
      for (const listener of listeners)
        listener({ data: { type: 'hostSettings', settings } })
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener)
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener)
    },
  }
  const { AccountExportSection } =
    require('./AccountExportSection.tsx') as typeof import('./AccountExportSection.js')
  const container = document.getElementById('root')!
  const root = createRoot(container)
  try {
    await act(async () => root.render(<AccountExportSection />))
    const link = container.querySelector('a[target="_blank"]')
    return {
      href: link?.getAttribute('href') ?? null,
      text: container.textContent ?? '',
    }
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

test('a Linux host that reports exportInBrowser gets the browser link', async () => {
  const { href, text } = await renderInLinux(linuxSettings(true))
  assert.equal(href, '/settings#export')
  assert.ok(!text.includes('To download your data'))
})

test('an older Linux host keeps the instructions', async () => {
  const { href, text } = await renderInLinux(linuxSettings(false))
  assert.equal(href, null)
  assert.ok(text.includes('To download your data'))
})
