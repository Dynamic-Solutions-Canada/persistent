/** Native presentation invariants with injected time and a controllable notification daemon. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NotificationEngine, type NotificationSurface } from './notification-engine.js'
import { activeProjection, type PresentedAlarm } from './projection.js'

function alarm(id = 'one', extra: Partial<PresentedAlarm> = {}): PresentedAlarm {
  return {
    occurrenceId: id, reminderId: 'reminder', title: 'Synthetic reminder', body: 'Unticked item', fireAtMs: 0,
    soundIntervalSeconds: 0, alarm: false, ongoing: true, canSilence: false, soundKind: 'notification',
    sound: null, nagSound: null, shadeProminence: 'INHERIT', escalated: false, ...extra
  }
}
function fixture() {
  let time = 10_000
  let sequence = 0
  const shown: { id: number; alarm: PresentedAlarm; confirming: boolean; audible: boolean }[] = []
  const closed: number[] = []
  const audio: boolean[] = []
  const writes: [string, string][] = []
  const opened: [string, string | undefined][] = []
  const errors: string[] = []
  const surface: NotificationSurface = {
    async show(alarm, _replace, confirming, audible) {
      const id = ++sequence
      shown.push({ id, alarm, confirming, audible })
      return id
    },
    async close(id) { closed.push(id) },
    audio: (active) => audio.push(active), open: (id, snooze) => opened.push([id, snooze]),
    async write(id, action) { writes.push([id, action]); return true },
    error: (message) => errors.push(message)
  }
  const engine = new NotificationEngine(surface, () => time)
  return { engine, surface, shown, closed, audio, writes, opened, errors, advance: (ms: number) => { time += ms } }
}

test('shared projection selects only due alarms, escalation wins independent of order, and malformed reads reject', () => {
  const base = alarm()
  const escalated = alarm('one::esc', { fireAtMs: 100 })
  const snapshot = { serverTime: new Date(200).toISOString(), alarms: [escalated, base, alarm('future', { fireAtMs: 300 })] }
  const projection = activeProjection(snapshot)
  assert.equal(projection.size, 1)
  assert.equal(projection.get('one')?.alarm, true)
  assert.equal(projection.get('one')?.canSilence, true)
  assert.throws(() => activeProjection({ serverTime: snapshot.serverTime, alarms: [{}] }))
  assert.throws(() => activeProjection({ alarms: [] }))
  for (const invalid of [{ fireAtMs: Infinity }, { soundIntervalSeconds: Infinity }, { soundIntervalSeconds: -1 }]) {
    assert.throws(() => activeProjection({ ...snapshot, alarms: [{ ...base, ...invalid }] }))
  }
})

test('two occurrences of the same reminder remain independent and unchanged recovery is quiet', async () => {
  const f = fixture()
  const projection = new Map([['one', alarm()], ['two', alarm('two')]])
  await f.engine.reconcile(projection)
  await f.engine.reconcile(projection)
  assert.equal(f.shown.length, 2)
  await f.engine.remove('one')
  assert.deepEqual(f.closed, [1])
  await f.engine.tick()
  assert.equal(f.shown.length, 2)
})

test('Done requires a second confirmation; Not yet writes nothing; stale buttons cannot acknowledge', async () => {
  const f = fixture()
  await f.engine.reconcile(new Map([['one', alarm()]]))
  await f.engine.action(1, 'confirm')
  assert.equal(f.writes.length, 0)
  await f.engine.action(1, 'done')
  assert.equal(f.shown.at(-1)?.confirming, true)
  await f.engine.action(2, 'cancel')
  assert.equal(f.shown.at(-1)?.confirming, false)
  assert.equal(f.writes.length, 0)
  await f.engine.action(3, 'done')
  await f.engine.action(4, 'confirm')
  assert.deepEqual(f.writes, [['one', 'ack']])
  await f.engine.action(4, 'confirm')
  assert.equal(f.writes.length, 1)
})

test('rejected native actions retain presentation and Snooze opens the existing web picker', async () => {
  const f = fixture()
  f.surface.write = async () => false
  await f.engine.reconcile(new Map([['one', alarm()]]))
  await f.engine.action(1, 'snooze')
  assert.deepEqual(f.opened, [['reminder', 'one']])
  assert.equal(f.writes.length, 0)
  await f.engine.action(1, 'done')
  await f.engine.action(2, 'confirm')
  assert.equal(f.closed.length, 0)
  assert.equal(f.errors.length, 1)
  assert.equal(f.shown.at(-1)?.confirming, true)
})

test('dismissal restoration is quiet, nags repeat on the server interval, confirmation does not re-nag', async () => {
  const f = fixture()
  await f.engine.reconcile(new Map([['one', alarm('one', { soundIntervalSeconds: 60 })]]))
  f.engine.closed(1, 2)
  f.advance(4999)
  await f.engine.tick()
  assert.equal(f.shown.length, 1)
  f.advance(1)
  await f.engine.tick()
  assert.equal(f.shown.at(-1)?.audible, false)
  f.advance(55_000)
  await f.engine.tick()
  assert.equal(f.shown.at(-1)?.audible, true)
  await f.engine.action(3, 'done')
  f.advance(60_000)
  await f.engine.tick()
  assert.equal(f.shown.length, 4)
})

test('alarm audio remains while any alarm is active and De-escalate waits for a server projection', async () => {
  const f = fixture()
  await f.engine.reconcile(new Map([['one', alarm('one', { alarm: true, canSilence: true })], ['two', alarm('two', { alarm: true })]]))
  assert.equal(f.audio.at(-1), true)
  await f.engine.action(1, 'silence')
  assert.deepEqual(f.writes, [['one', 'silence']])
  assert.equal(f.audio.at(-1), true)
  await f.engine.remove('one')
  assert.equal(f.audio.at(-1), true)
  await f.engine.remove('two')
  assert.equal(f.audio.at(-1), false)
})

test('late native publication after sign-out is removed and its actions cannot reach another account', async () => {
  const f = fixture()
  let release!: (id: number) => void
  f.surface.show = () => new Promise((resolve) => { release = resolve })
  const pending = f.engine.reconcile(new Map([['one', alarm('one', { alarm: true })]]))
  await Promise.resolve()
  await f.engine.reset()
  release(99)
  await pending
  await f.engine.action(99, 'done')
  assert.ok(f.closed.includes(99))
  assert.equal(f.audio.at(-1), false)
  assert.equal(f.writes.length, 0)
})

test('a daemon restart restores known occurrences without reusing obsolete daemon IDs', async () => {
  const f = fixture()
  await f.engine.reconcile(new Map([['one', alarm()]]))
  f.engine.daemonRestarted()
  await f.engine.action(1, 'done')
  assert.equal(f.shown.length, 1)
  f.advance(5000)
  await f.engine.tick()
  assert.equal(f.shown.length, 2)
})
