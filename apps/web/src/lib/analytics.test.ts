import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

import {
  buildTrackerScript,
  isNativeHostPage,
  sanitizeTrackedPayload,
  sanitizeTrackedUrl,
  type HostSignals,
} from './analytics.js'

const chromeOnWindows =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const browser: HostSignals = {
  userAgent: chromeOnWindows,
  capacitorNative: false,
  hasWebView2: false,
  hasLinuxBridge: false,
}

test('a web browser is not a native host', () => {
  assert.equal(isNativeHostPage(browser), false)
  assert.equal(
    isNativeHostPage({
      ...browser,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
    }),
    false,
  )
})

test('the Android app is detected by Capacitor and by its WebView user agent', () => {
  assert.equal(isNativeHostPage({ ...browser, capacitorNative: true }), true)
  assert.equal(
    isNativeHostPage({
      ...browser,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0.0.0 Mobile Safari/537.36',
    }),
    true,
  )
})

test('the Windows app is detected by WebView2 in any frame or popup', () => {
  assert.equal(isNativeHostPage({ ...browser, hasWebView2: true }), true)
})

test('the Linux app is detected by its bridge and, in bridge-less popups, by Electron', () => {
  assert.equal(isNativeHostPage({ ...browser, hasLinuxBridge: true }), true)
  assert.equal(
    isNativeHostPage({
      ...browser,
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) persistent-linux/0.2.0 Chrome/140.0.0.0 Electron/38.0.0 Safari/537.36',
    }),
    true,
  )
})

test('identifiers, queries and hashes never reach the tracked URL', () => {
  assert.equal(
    sanitizeTrackedUrl('/reminders/cmfx2k8q90001abcdefghij12'),
    '/reminders/:id',
  )
  assert.equal(
    sanitizeTrackedUrl('/shared/cmfx2k8q90001abcdefghij12?invite=1#export'),
    '/shared/:id',
  )
  assert.equal(
    sanitizeTrackedUrl(
      'https://persistent.dynamic-solutions.ca/reminders/550e8400-e29b-41d4-a716-446655440000/edit',
    ),
    'https://persistent.dynamic-solutions.ca/reminders/:id/edit',
  )
  assert.equal(sanitizeTrackedUrl('/settings#export'), '/settings')
  assert.equal(sanitizeTrackedUrl('/upcoming'), '/upcoming')
})

test('a reminder title never reaches Umami: the title is always the app name', () => {
  const sent = sanitizeTrackedPayload('event', {
    url: '/reminders/cmfx2k8q90001abcdefghij12',
    referrer: 'https://example.com/search?q=secret#x',
    title: 'Take my medication',
    website: 'id',
  })
  assert.deepEqual(sent, {
    url: '/reminders/:id',
    referrer: 'https://example.com/search',
    title: 'Persistent',
    website: 'id',
  })
})

test('the tracker script carries every privacy setting', () => {
  const dom = new JSDOM('<!doctype html><html><head></head></html>')
  const script = buildTrackerScript(
    {
      scriptUrl: 'https://analytics.dynamic-solutions.ca/script.js',
      websiteId: 'b3ce5e5e-f64c-4bb6-b90c-95c85f994d10',
      domains: ['persistent.dynamic-solutions.ca'],
    },
    dom.window.document,
  )
  assert.equal(script.src, 'https://analytics.dynamic-solutions.ca/script.js')
  assert.equal(script.defer, true)
  assert.deepEqual(
    { ...script.dataset },
    {
      websiteId: 'b3ce5e5e-f64c-4bb6-b90c-95c85f994d10',
      domains: 'persistent.dynamic-solutions.ca',
      excludeSearch: 'true',
      excludeHash: 'true',
      doNotTrack: 'true',
      beforeSend: 'persistentAnalyticsBeforeSend',
    },
  )
})

test('startAnalytics loads the tracker only in a browser with analytics configured', async () => {
  const { startAnalytics } = await import('./analytics.js')
  const configured = {
    analytics: {
      scriptUrl: 'https://analytics.dynamic-solutions.ca/script.js',
      websiteId: 'b3ce5e5e-f64c-4bb6-b90c-95c85f994d10',
      domains: ['persistent.dynamic-solutions.ca'],
    },
  }

  /** Run startAnalytics in a fresh page; returns the fetches made and whether a script loaded. */
  async function run(
    body: unknown,
    setup: (win: Record<string, unknown>) => void = () => {},
    capacitorNative = false,
  ) {
    const dom = new JSDOM('<!doctype html><html><head></head></html>', {
      url: 'https://persistent.dynamic-solutions.ca/',
    })
    setup(dom.window as unknown as Record<string, unknown>)
    const fetched: string[] = []
    const saved = new Map<string, PropertyDescriptor | undefined>()
    const values: Record<string, unknown> = {
      window: dom.window,
      document: dom.window.document,
      navigator: dom.window.navigator,
      fetch: async (url: string) => {
        fetched.push(url)
        return new Response(JSON.stringify(body), { status: 200 })
      },
    }
    for (const [key, value] of Object.entries(values)) {
      saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value,
      })
    }
    try {
      await startAnalytics(capacitorNative)
      return {
        fetched,
        loaded: Boolean(dom.window.document.head.querySelector('script')),
      }
    } finally {
      dom.window.close()
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    }
  }

  assert.deepEqual(await run(configured), {
    fetched: ['/api/analytics-config'],
    loaded: true,
  })
  assert.deepEqual(await run({ analytics: null }), {
    fetched: ['/api/analytics-config'],
    loaded: false,
  })
  // Each native host: nothing is even requested.
  assert.deepEqual(await run(configured, () => {}, true), {
    fetched: [],
    loaded: false,
  })
  assert.deepEqual(
    await run(configured, (win) => {
      win.chrome = { webview: {} }
    }),
    { fetched: [], loaded: false },
  )
  assert.deepEqual(
    await run(configured, (win) => {
      win.persistentDesktop = {}
    }),
    { fetched: [], loaded: false },
  )
})
