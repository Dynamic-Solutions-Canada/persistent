/** Pin every publication and late cleanup to the unique daemon that created it. */
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import dbus from '@particle/dbus-next'
import { LinuxNotifications } from './notifications.js'
import type { PresentedAlarm } from './projection.js'

const alarm: PresentedAlarm = { occurrenceId: 'one', reminderId: 'reminder', title: 'Synthetic', body: 'Body', fireAtMs: 0,
  soundIntervalSeconds: 0, alarm: false, ongoing: true, canSilence: false, soundKind: 'notification', sound: null,
  nagSound: null, shadeProminence: 'INHERIT', escalated: false }

class Daemon extends EventEmitter {
  closed: number[] = []
  notify: () => Promise<number> = async () => 7
  GetCapabilities = async () => ['actions']
  Notify = async () => this.notify()
  CloseNotification = async (id: number) => { this.closed.push(id) }
}

test('restarted daemon IDs and delayed old publications cannot close or action a new daemon notification', async () => {
  const old = new Daemon(); const current = new Daemon()
  let owner = ':1.old'
  const control = Object.assign(new EventEmitter(), { GetNameOwner: async () => owner })
  const bus = Object.assign(new EventEmitter(), {
    disconnect: () => {},
    getProxyObject: async (destination: string) => ({ getInterface: () => {
      if (destination === 'org.freedesktop.DBus') return control
      assert.ok(destination.startsWith(':1.'), 'notification RPC must target a unique owner')
      return destination === ':1.old' ? old : current
    } })
  })
  mock.method(dbus, 'sessionBus', () => bus)
  const client = new LinuxNotifications('/owned/icon.png', () => {})
  try {
    const first = await client.show(alarm, 0, false, false)
    let resolve!: (id: number) => void; let started!: () => void
    const notified = new Promise<void>((accept) => { started = accept })
    old.notify = () => { started(); return new Promise((accept) => { resolve = accept }) }
    const late = client.show(alarm, first, true, false)
    await notified
    owner = ':1.new'; control.emit('NameOwnerChanged', 'org.freedesktop.Notifications', ':1.old', ':1.new')
    const fresh = await client.show(alarm, 0, false, false)
    assert.notEqual(fresh, first)
    resolve(7)
    await assert.rejects(late, /restarted/)
    await client.close(first)
    assert.deepEqual(current.closed, [])
    const actions: [number, string][] = []
    client.onAction = (id, action) => { actions.push([id, action]) }
    old.emit('ActionInvoked', 7, 'confirm')
    current.emit('ActionInvoked', 7, 'done')
    assert.deepEqual(actions, [[fresh, 'done']])
    await client.close(fresh)
    assert.deepEqual(current.closed, [7])
    assert.ok(old.closed.includes(7))
  } finally { client.dispose(); mock.restoreAll() }
})
