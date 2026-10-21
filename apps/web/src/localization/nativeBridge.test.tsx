import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import type { NativeLanguageState, NativeLocale, Locale } from '@persistent/shared'
import { SettingsProvider, useSettings } from '../settings/useSettings.js'
import { NativePresentationSync } from '../native/NativePresentationSync.js'
import { configureLocale } from './i18n.js'

Object.defineProperty(globalThis, 'React', { configurable: true, value: React })

test('real settings and native mirror preserve a slow OS read, fence events, and converge after an in-app choice', async (context) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  localStorage.setItem('persistent-settings', JSON.stringify({ languageOverride: 'de-DE', timeFormatChosen: true, timeFormat: '12h', alarmSound: { uri: 'saved-tone', title: 'My tone' }, themeDefaultMigrated: true }))
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
  let resolveRead!: (value: NativeLanguageState) => void
  const initialRead = new Promise<NativeLanguageState>((resolve) => { resolveRead = resolve })
  let event!: (value: NativeLanguageState) => void
  const writes: NativeLocale[] = []
  let osLanguage: Locale | null = 'fr-CA'
  const state = (): NativeLanguageState => ({ version: 1, languageOverride: osLanguage, deviceLanguages: ['en-CA'] })
  const bridge = {
    getLocale: async () => initialRead,
    async addListener(_name: 'localeChanged', listener: (value: NativeLanguageState) => void) { event = listener; return { async remove() {} } },
    async setLocale({ locale }: { locale: NativeLocale }) {
      writes.push(locale)
      if (osLanguage !== locale.languageOverride) {
        osLanguage = locale.languageOverride
        event(state())
      }
    }
  }
  function Page() {
    const settings = useSettings()
    return <><input defaultValue="Unsaved medicine text" /><output>{settings.locale}</output><button onClick={() => settings.setLanguageOverride('pt-BR')}>Language</button></>
  }
  await act(async () => root.render(<SettingsProvider nativeBridge={bridge}><NativePresentationSync nativeBridge={bridge} /><Page /></SettingsProvider>))
  const input = document.querySelector('input')!
  input.value = 'Insulin 10 units, unsaved'
  // Regression: the former 1500ms timeout treated a slow supported host as legacy.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1600)) })
  assert.equal(writes.length, 0)
  assert.equal(osLanguage, 'fr-CA')

  await act(async () => { osLanguage = 'ja-JP'; event(state()) })
  assert.equal(document.querySelector('output')!.textContent, 'ja-JP')
  assert.equal(writes.length, 1)
  assert.equal(writes[0]!.languageOverride, 'ja-JP')
  await act(async () => resolveRead({ ...state(), languageOverride: 'fr-CA' }))
  assert.equal(document.querySelector('output')!.textContent, 'ja-JP')
  assert.equal(writes.length, 1)

  await act(async () => document.querySelector('button')!.click())
  assert.equal(osLanguage, 'pt-BR')
  assert.equal(writes.length, 2, 'The config event echo must not trigger another native write')
  assert.equal(document.querySelector('input'), input)
  assert.equal(input.value, 'Insulin 10 units, unsaved')
  const saved = JSON.parse(localStorage.getItem('persistent-settings')!)
  assert.equal(saved.timeFormat, '12h')
  assert.equal(saved.alarmSound.uri, 'saved-tone')
})
