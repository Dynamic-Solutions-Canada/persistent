import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { Trans } from 'react-i18next'
import { SettingsProvider, useSettings } from '../settings/useSettings.js'
import { formatDateTime, formatWhen } from '../lib/datetime.js'
import { configureLocale, i18n } from './i18n.js'

// The root test runner uses classic JSX while production Vite uses automatic JSX.
Object.defineProperty(globalThis, 'React', { configurable: true, value: React })

test('rich English copy decodes JSX entities and preserves interpolated content literally', () => {
  configureLocale('en-US', 'en-US')
  const key = "Persistent is a reminder that doesn't give up. When a reminder is due it <c0>sends you a notification</c0>. If you don't confirm it, it keeps <c1>nagging</c1>, the notification comes back (and can re-sound, or ring as a full alarm), until you <c2>explicitly mark it done</c2>. Swiping it away isn't enough; that's the whole point."
  const dom = new JSDOM(renderToStaticMarkup(<Trans i18nKey={key} components={{ c0: <b />, c1: <b />, c2: <b /> }} />))
  assert.match(dom.window.document.body.textContent!, /doesn't give up/)
  assert.equal(dom.window.document.querySelectorAll('b').length, 3)
  assert.doesNotMatch(dom.window.document.body.textContent!, /&apos;|<c[0-9]/)
  dom.window.close()

  const title = '<c0>name & dose</c0> {{notATemplate}}'
  const html = renderToStaticMarkup(<Trans i18nKey="Code sent to <v0/>" components={{ v0: <>{title}</> }} />)
  const literal = new JSDOM(html)
  assert.equal(literal.window.document.body.textContent, `Code sent to ${title}`)
  assert.equal(literal.window.document.querySelector('c0'), null)
  literal.window.close()
})

test('region-only change immediately reformats mounted dates and keeps drafts and explicit clock choice', async (context) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, value })
  }
  dom.window.localStorage.setItem('persistent-settings', JSON.stringify({ languageOverride: 'en-US', formattingLocaleOverride: 'en-US', timeFormat: '12h', timeFormatChosen: true, alarmSound: { uri: 'saved-tone', title: 'My tone' }, themeDefaultMigrated: true }))
  configureLocale('en-US', 'en-US')
  const root = createRoot(dom.window.document.getElementById('root')!)
  context.after(async () => {
    await act(async () => root.unmount())
    configureLocale('en-US', 'en-US')
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  })
  const instant = '2026-10-20T17:30:00Z'
  function Page() {
    const { timeFormat, setFormattingLocaleOverride } = useSettings()
    const [draft] = useState('Unsent draft')
    return <><input defaultValue={draft} /><output>{formatDateTime(instant, timeFormat, 'UTC')}</output><button onClick={() => setFormattingLocaleOverride('de-DE')}>Region</button></>
  }
  await act(async () => root.render(<SettingsProvider><Page /></SettingsProvider>))
  const before = dom.window.document.querySelector('output')!.textContent
  const input = dom.window.document.querySelector('input')!
  input.value = 'Edited and unsaved'
  await act(async () => dom.window.document.querySelector('button')!.click())
  const after = dom.window.document.querySelector('output')!.textContent
  assert.notEqual(after, before)
  assert.equal(after, new Intl.DateTimeFormat('de-DE', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(new Date(instant)))
  assert.equal(dom.window.document.querySelector('input'), input)
  assert.equal(input.value, 'Edited and unsaved')
  assert.equal(i18n.language, 'en-US')
  const saved = JSON.parse(dom.window.localStorage.getItem('persistent-settings')!)
  assert.equal(saved.timeFormat, '12h')
  assert.equal(saved.timeFormatChosen, true)
  assert.equal(saved.alarmSound.uri, 'saved-tone')
})

test('calendar and numeral extensions never affect relative-day Gregorian calculations', () => {
  configureLocale('en-US', 'ar-SA-u-ca-islamic-nu-arab')
  const value = formatWhen('2026-10-20T17:00:00Z', '24h', 'UTC', new Date('2026-10-20T12:00:00Z'))
  assert.match(value, /^Today, /)
  configureLocale('en-US', 'en-US')
})
