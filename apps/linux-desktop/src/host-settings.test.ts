/** Late registration must not revert preferences saved concurrently by the separate native window. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HostSettings } from './host-settings.js'
import { SettingsStore, validatedSettings, type Autostart } from './settings.js'
import type { HostedWindow } from './hosted-window.js'

test('host settings rebase after asynchronous registration preserves newer native preferences', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'persistent-settings-race-'))
  try {
    const store = new SettingsStore(directory, () => {})
    let finish!: (enabled: boolean) => void
    const startup = { enabled: () => false, set: () => {} } as unknown as Autostart
    const hosted = { syncChrome: () => {}, send: () => {}, wayland: false, window: { setContentSize: () => {} } } as unknown as HostedWindow
    const settings = new HostSettings(store, startup, hosted, () => new Promise((accept) => { finish = accept }), () => {})
    const pending = settings.apply({ notifications: true, pinFlyout: true })
    store.save(validatedSettings({ appTheme: 'dark', checkUpdatesAutomatically: false }, store.current))
    finish(true); await pending
    assert.equal(store.current.appTheme, 'dark')
    assert.equal(store.current.checkUpdatesAutomatically, false)
    assert.equal(store.current.notifications, true)
    assert.equal(store.current.pinFlyout, true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
