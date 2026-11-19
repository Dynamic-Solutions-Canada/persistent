/**
 * "Download my data" in the Android app: the button asks the host to open the export page in the
 * system browser, and an older host without `openInBrowser` falls back to the instruction line.
 * The Capacitor Android runtime is stood in for by `androidBridge` and `nativePromise`, which the
 * real shell injects.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
const require = createRequire(import.meta.url)

/**
 * The stand-in for the Android shell's injected Capacitor runtime. @capacitor/core reads it once,
 * when the component first loads, so every test shares it and sets [reply] for itself.
 */
const opened: string[] = []
let reply: () => Promise<unknown> = () => Promise.resolve({})
const capacitor = {
  PluginHeaders: [
    {
      name: 'AlarmPlugin',
      methods: [{ name: 'openInBrowser', rtype: 'promise' }],
    },
  ],
  nativePromise: (
    _plugin: string,
    method: string,
    options: { url: string },
  ) => {
    if (method === 'openInBrowser') opened.push(options.url)
    return reply()
  },
}

/** A JSDOM window on the app's settings page, with [answer] for `openInBrowser`. */
function androidWindow(answer: () => Promise<unknown>) {
  opened.length = 0
  reply = answer
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://persistent.example/settings',
    pretendToBeVisual: true,
  })
  return { dom, opened, capacitor }
}

/** Run [body] with the DOM globals pointing at [dom], restoring them afterwards. */
async function withGlobals(
  dom: JSDOM,
  capacitor: unknown,
  body: () => Promise<void>,
) {
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
    // @capacitor/core reads these from globalThis when it loads.
    androidBridge: { postMessage: () => {} },
    Capacitor: capacitor,
  }
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    })
  }
  try {
    await body()
  } finally {
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

/** Render the section, click "Open in browser", and return the section's text afterwards. */
async function clickOpenInBrowser(): Promise<string> {
  const { AccountExportSection } =
    require('./AccountExportSection.tsx') as typeof import('./AccountExportSection.js')
  const container = document.getElementById('root')!
  const root = createRoot(container)
  try {
    await act(async () => root.render(<AccountExportSection />))
    const button = [...container.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('Open in browser'),
    )
    assert.ok(button, 'the Android app shows the Open in browser button')
    await act(async () => button.click())
    return container.textContent ?? ''
  } finally {
    await act(async () => root.unmount())
  }
}

test('the Android app opens the export section in the system browser', async () => {
  const { dom, opened, capacitor } = androidWindow(() => Promise.resolve({}))
  await withGlobals(dom, capacitor, async () => {
    const text = await clickOpenInBrowser()
    assert.deepEqual(opened, ['https://persistent.example/settings#export'])
    assert.ok(!text.includes('To download your data'))
  })
})

test('an older Android app without openInBrowser falls back to the instructions', async () => {
  const { dom, opened, capacitor } = androidWindow(() =>
    Promise.reject(
      Object.assign(new Error('not implemented'), { code: 'UNIMPLEMENTED' }),
    ),
  )
  await withGlobals(dom, capacitor, async () => {
    const text = await clickOpenInBrowser()
    assert.equal(opened.length, 1)
    assert.ok(text.includes('To download your data'))
    assert.ok(!text.includes('Open in browser'))
  })
})
