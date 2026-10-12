/** DNS propagation retries must never replay a request after an unknown transport outcome. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAfterDnsPropagation } from './test-lab-transport.mjs'

const noWait = async () => {}
const transportError = (code: string) => Object.assign(new Error('transport'), { cause: { code } })

test('fresh tunnel DNS retries only before connection, preserving request options', async () => {
  let attempts = 0
  const result = await fetchAfterDnsPropagation('https://fixture.example.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'synthetic' }, async (_url: string, options: RequestInit) => {
    assert.equal(options.method, 'POST')
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' })
    assert.equal(options.body, 'synthetic')
    if (++attempts < 3) throw transportError('ENOTFOUND')
    return new Response('ok')
  }, noWait)
  assert.equal(attempts, 3)
  assert.equal(await result.text(), 'ok')
})

test('unknown POST outcomes and timeout are never retried', async () => {
  for (const code of ['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']) {
    let attempts = 0
    await assert.rejects(fetchAfterDnsPropagation('https://fixture.example.test', { method: 'POST' }, async () => {
      attempts++
      throw transportError(code)
    }, noWait))
    assert.equal(attempts, 1)
  }
})

test('DNS propagation stops after three attempts and does not retry HTTP failure', async () => {
  let attempts = 0
  await assert.rejects(fetchAfterDnsPropagation('https://fixture.example.test', {}, async () => {
    attempts++
    throw transportError('EAI_AGAIN')
  }, noWait))
  assert.equal(attempts, 3)
  for (const status of [401, 403, 503]) {
    attempts = 0
    const result = await fetchAfterDnsPropagation('https://fixture.example.test', { method: 'POST' }, async () => {
      attempts++
      return new Response('blocked', { status })
    }, noWait)
    assert.equal(attempts, 1)
    assert.equal(result.status, status)
  }
})
