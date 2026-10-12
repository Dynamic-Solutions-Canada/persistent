/** Recovery failures, account transitions, and late realtime callbacks must not clear or leak obligations. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { BackgroundClient, type ProfileTransport } from './background-client.js'
import { NotificationEngine } from './notification-engine.js'

const alarm = {
  occurrenceId: 'one', reminderId: 'reminder', title: 'Synthetic', body: '', fireAtMs: 0,
  soundIntervalSeconds: 0, alarm: true, ongoing: true, canSilence: false,
  soundKind: 'alarm', sound: null, nagSound: null, shadeProminence: 'INHERIT'
}
const snapshot = { serverTime: new Date().toISOString(), alarms: [alarm] }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

test('confirmed sign-in resumes delivery after prior-account cleanup pauses the new cookie', async () => {
  const f = fixture()
  try {
    f.client.start()
    await flush()
    f.client.sessionChanged(true)
    await flush()
    assert.equal(f.audio.at(-1), false)
    f.client.sessionConfirmed()
    await flush()
    assert.equal(f.audio.at(-1), true)
    assert.equal(f.shown.length, 2)
    f.client.sessionConfirmed()
    await flush()
    assert.equal(f.shown.length, 2)
  } finally { f.client.stop() }
})

function fixture() {
  const shown: string[] = []
  const closed: number[] = []
  const audio: boolean[] = []
  const sockets: EventEmitter[] = []
  let sequence = 0
  const engine = new NotificationEngine({
    async show(alarm) { shown.push(alarm.occurrenceId); return ++sequence },
    async close(id) { closed.push(id) }, audio: (value) => audio.push(value),
    open: () => {}, write: async () => true, error: () => {}
  })
  const transport: ProfileTransport = {
    origin: () => 'http://localhost', cookie: async () => 'persistent_auth=synthetic',
    request: async () => Response.json(snapshot), log: () => {}
  }
  const client = new BackgroundClient(transport, engine, () => {
    const socket = Object.assign(new EventEmitter(), { terminate() {} })
    sockets.push(socket)
    return socket
  })
  return { transport, engine, client, shown, closed, audio, sockets }
}

test('network and malformed projection failures retain active notifications and audio; resume does too', async () => {
  const f = fixture()
  try {
    f.client.start()
    await flush()
    assert.deepEqual(f.shown, ['one'])
    f.transport.request = async () => { throw new Error('Offline') }
    f.client.refresh()
    await flush()
    assert.equal(f.closed.length, 0)
    f.client.resume()
    await flush()
    assert.equal(f.audio.at(-1), true)
    f.transport.request = async () => Response.json({ alarms: [] })
    f.client.refresh()
    await flush()
    assert.equal(f.closed.length, 0)
  } finally { f.client.stop() }
})

test('a confirmed 401 clears obligations and closes the background socket', async () => {
  const f = fixture()
  try {
    f.client.start()
    await flush()
    f.transport.request = async () => new Response(null, { status: 401 })
    f.client.refresh()
    await flush()
    assert.ok(f.closed.includes(1))
    assert.equal(f.audio.at(-1), false)
    f.sockets[0]!.emit('message', Buffer.from(JSON.stringify({ type: 'occurrence.changed' })))
    await flush()
    assert.equal(f.shown.length, 1)
  } finally { f.client.stop() }
})

test('a delayed snapshot from the old account and its old socket are fenced after logout', async () => {
  const f = fixture()
  let resolve!: (response: Response) => void
  f.transport.request = () => new Promise((done) => { resolve = done })
  try {
    f.client.start()
    await flush()
    f.client.sessionChanged(true)
    resolve(Response.json(snapshot))
    f.sockets[0]!.emit('message', Buffer.from(JSON.stringify({ type: 'occurrence.fired' })))
    await flush()
    assert.equal(f.shown.length, 0)
    assert.equal(f.audio.at(-1), false)
  } finally { f.client.stop() }
})

test('notification POSTs do not retry unknown outcomes, and a rejected action returns false', async () => {
  const f = fixture()
  let writes = 0
  try {
    f.client.start()
    await flush()
    f.transport.request = async (_path, init) => {
      if (init.method === 'POST') { writes++; throw new Error('Connection lost after dispatch') }
      return Response.json(snapshot)
    }
    assert.equal(await f.client.write('one', 'ack'), false)
    await flush()
    assert.equal(writes, 1)
    f.transport.request = async () => new Response(null, { status: 409 })
    assert.equal(await f.client.write('one', 'silence'), false)
  } finally { f.client.stop() }
})

test('late native enable cannot revive a signed-out session, while an ordinary disable/enable still recovers', async () => {
  const f = fixture()
  try {
    f.client.sessionChanged(true)
    f.client.start()
    await flush()
    assert.equal(f.shown.length, 0)
    assert.equal(f.sockets.length, 0)
    f.client.sessionChanged(false)
    await flush()
    assert.deepEqual(f.shown, ['one'])
    f.client.stop()
    f.client.start()
    await flush()
    assert.deepEqual(f.shown, ['one', 'one'])
  } finally { f.client.stop() }
})
