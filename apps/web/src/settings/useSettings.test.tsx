/** Exercise device clock resolution through the real provider and native transport. */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { SettingsProvider, useSettings } from './useSettings.js'

const hostSettings = {
  notifications: true,
  snoozeMinutes: 5,
  snoozeChoices: [{ minutes: 5, label: '5 min' }],
  pinFlyout: false,
  startAtSignIn: false,
  flyoutSize: 'standard',
  flyoutSizes: [{ id: 'standard', label: 'Standard', width: 420, height: 680 }]
}

/** A synchronous first reply catches subscriptions attached after the initial request. */
async function mountSettings(context: TestContext, stored: Record<string, unknown>, clock?: string) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const listeners = new Set<(event: { data: unknown }) => void>()
  const requests: unknown[] = []
  const send = (data: unknown) => { for (const listener of listeners) listener({ data }) }
  Object.defineProperty(dom.window, 'chrome', { value: { webview: {
    postMessage(message: unknown) {
      requests.push(message)
      if ((message as { type: string }).type === 'getHostSettings') {
        send({ type: 'hostSettings', settings: { ...hostSettings, ...(clock ? { deviceTimeFormat: clock } : {}) } })
      }
    },
    addEventListener(_type: string, listener: (event: { data: unknown }) => void) { listeners.add(listener) },
    removeEventListener(_type: string, listener: (event: { data: unknown }) => void) { listeners.delete(listener) }
  } } })
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [name, value] of Object.entries({ React, window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, value })
  }
  dom.window.localStorage.setItem('persistent-settings', JSON.stringify(stored))
  const root = createRoot(dom.window.document.getElementById('root')!)
  context.after(async () => {
    await act(async () => root.unmount())
    assert.equal(listeners.size, 0)
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  })
  let current!: ReturnType<typeof useSettings>
  function Probe() {
    current = useSettings()
    return <span>{current.timeFormat}</span>
  }
  await act(async () => root.render(<SettingsProvider nativeBridge={null}><Probe /></SettingsProvider>))
  return {
    current: () => current,
    requests,
    send: async (data: unknown) => { await act(async () => send(data)) },
    changeClock(value: string) { clock = value },
    storage: dom.window.localStorage
  }
}

test('Match device uses Windows clock even when the regional locale defaults to 24 hours', async (context) => {
  const app = await mountSettings(context, { formattingLocaleOverride: 'de-DE', timeFormat: '24h', timeFormatChosen: false }, '12h')
  assert.equal(app.current().timeFormat, '12h')
  assert.equal(app.current().timeFormatChosen, false)
  assert.equal(app.current().formattingLocale, 'de-DE')
  assert.ok(app.requests.some((message) => (message as { type: string }).type === 'getHostSettings'))
  app.changeClock('24h')
  await app.send({ type: 'checkForUpdate' })
  assert.equal(app.current().timeFormat, '24h')
  app.changeClock('12h')
  await app.send({ type: 'checkForUpdate' })
  assert.equal(app.current().timeFormat, '12h')
  assert.equal(JSON.parse(app.storage.getItem('persistent-settings')!).timeFormatChosen, false)
})

test('explicit clock wins over initial and later Windows replies; resetting uses latest device value', async (context) => {
  const app = await mountSettings(context, { formattingLocaleOverride: 'de-DE', timeFormat: '24h', timeFormatChosen: true }, '12h')
  assert.equal(app.current().timeFormat, '24h')
  await app.send({ type: 'hostSettings', settings: { ...hostSettings, deviceTimeFormat: '12h' } })
  assert.equal(app.current().timeFormat, '24h')
  await act(async () => app.current().resetTimeFormat())
  assert.equal(app.current().timeFormat, '12h')
  await act(async () => app.current().setTimeFormat('24h'))
  assert.equal(app.current().timeFormat, '24h')
})

test('older hosts and invalid device clocks retain locale fallback', async (context) => {
  const app = await mountSettings(context, { formattingLocaleOverride: 'de-DE' })
  assert.equal(app.current().timeFormat, '24h')
  await app.send({ type: 'hostSettings', settings: { ...hostSettings, deviceTimeFormat: '13h' } })
  assert.equal(app.current().timeFormat, '24h')
  await app.send({ type: 'back' })
  assert.equal(app.current().timeFormat, '24h')
})
