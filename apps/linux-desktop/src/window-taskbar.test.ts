import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import x11 from 'x11'
import { hideFromTaskbar, x11WindowId } from './window-taskbar.js'

test('X11 window handles use the low 32 bits on either architecture', () => {
  assert.equal(x11WindowId(Buffer.from([49, 0, 192, 0])), 0xc00031)
  assert.equal(x11WindowId(Buffer.from([49, 0, 192, 0, 0, 0, 0, 0])), 0xc00031)
  assert.throws(() => x11WindowId(Buffer.alloc(3)))
})

test('taskbar requests add both hints to the selected root and close the connection', async () => {
  let terminated = false
  let sent: unknown[] = []
  const client = {
    screenNum: 1, on: () => {}, terminate: () => { terminated = true }, sync: async () => {},
    InternAtom: (_exists: boolean, name: string, done: (error: null, atom: number) => void) => done(null, name === '_NET_WM_STATE' ? 10 : name.endsWith('TASKBAR') ? 11 : 12),
    SendClientMessage: (...args: unknown[]) => { sent = args }
  }
  mock.method(x11, 'createClient', (ready: (error: null, display: unknown) => void) => {
    queueMicrotask(() => ready(null, { client, screen: [{ root: 1 }, { root: 2 }] }))
    return client
  })
  try {
    await hideFromTaskbar(Buffer.from([49, 0, 192, 0]))
    assert.deepEqual(sent, [2, 0xc00031, 10, 32, [1, 11, 12, 1, 0]])
    assert.equal(terminated, true)
  } finally { mock.restoreAll() }
})

test('a refused X11 request closes the connection and reports failure', async () => {
  let terminated = false
  const failure = new Error('Disconnected')
  const client = {
    on: () => {}, terminate: () => { terminated = true },
    InternAtom: (_exists: boolean, _name: string, done: (error: Error) => void) => done(failure)
  }
  mock.method(x11, 'createClient', (ready: (error: null, display: unknown) => void) => {
    queueMicrotask(() => ready(null, { client }))
    return client
  })
  try {
    await assert.rejects(hideFromTaskbar(Buffer.alloc(4)), failure)
    assert.equal(terminated, true)
  } finally { mock.restoreAll() }
})
