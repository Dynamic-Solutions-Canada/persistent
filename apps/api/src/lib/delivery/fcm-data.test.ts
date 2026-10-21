import assert from 'node:assert/strict'
import test from 'node:test'
import { message, supportedLocales, type PushPayload } from '@persistent/shared'
import { fcmData } from './fcm-data.js'
import { fcmFailureCode } from './fcm-status.js'

const payload: PushPayload = {
  type: 'escalate', occurrenceId: 'occurrence-1', reminderId: 'reminder-1',
  title: 'Medicine 💊', alarm: true, scheduledFor: '2026-10-21T12:00:00.000Z',
  soundUri: 'content://test/alarm', soundTitle: 'My tone', soundIntervalSeconds: 60
}

/** Firebase counts UTF-8 keys and values, excluding the HTTP envelope/device token. */
function dataBytes(data: Record<string, string>): number {
  return Object.entries(data).reduce((size, [key, value]) => size + Buffer.byteLength(key) + Buffer.byteLength(value), 0)
}

test('long ASCII, CJK and emoji content uses one lossless copy under the FCM cap', () => {
  for (const body of ['A'.repeat(2800), '药'.repeat(1000), '💊'.repeat(750)]) {
    for (const locale of supportedLocales) {
      const data = fcmData({ ...payload, body }, locale)
      const [start, length] = data.bodyRange!.split(':').map(Number)
      assert.equal(data.body!.slice(start, start! + length!), body)
      assert.equal(data.body, message(locale, '{{body}} (escalated)', { body }))
      assert.equal(data.baseBody, undefined)
      assert.ok(dataBytes(data) < 4096)
      assert.ok(dataBytes({ ...data, baseBody: body }) > 4096)
      assert.equal(data.occurrenceId, payload.occurrenceId)
      assert.equal(data.soundUri, payload.soundUri)
      assert.equal(data.alarm, 'true')
    }
  }
})

test('boundary payloads retain all content without truncation or sync substitution', () => {
  for (const unit of ['a', '药', '💊']) {
    let body = ''
    while (dataBytes(fcmData({ ...payload, body: body + unit }, 'ja-JP')) <= 4096) {
      body += unit
    }
    const below = fcmData({ ...payload, body }, 'ja-JP')
    const above = fcmData({ ...payload, body: body + unit }, 'ja-JP')
    assert.ok(dataBytes(below) <= 4096)
    assert.ok(dataBytes(above) > 4096)
    assert.equal(below.bodyRange, `0:${body.length}`)
    assert.equal(above.bodyRange, `0:${(body + unit).length}`)
    assert.equal(above.type, 'escalate')
    assert.equal(above.body, `${body + unit}（アラート強化）`)
  }
})

test('literal template-like content, empty bodies and unmarked messages preserve meaning', () => {
  const body = '💊 {{body}} (escalated)（已升级提醒） 10 units <b>literal</b>'
  const data = fcmData({ ...payload, body }, 'zh-CN')
  assert.equal(data.bodyRange, `0:${body.length}`)
  assert.equal(data.body, `${body}（已升级提醒）`)
  assert.equal(fcmData({ ...payload, body: '' }, 'fr-CA').bodyRange, '0:0')
  assert.equal(fcmData({ ...payload, body: '' }, 'fr-CA').body, message('fr-CA', 'Escalated'))
  const fire = fcmData({ ...payload, type: 'fire', body }, 'de-DE')
  assert.equal(fire.body, body)
  assert.equal(fire.bodyRange, undefined)
})

test('FCM failure diagnostics retain safe status codes without echoed reminder content or tokens', () => {
  assert.equal(fcmFailureCode(JSON.stringify({ error: {
    status: 'INVALID_ARGUMENT', message: 'private token and medicine detail',
    details: [{ body: 'private content' }]
  } })), 'INVALID_ARGUMENT')
  assert.equal(fcmFailureCode('{"error":{"status":"private token"}}'), undefined)
  assert.equal(fcmFailureCode('proxy error with private content'), undefined)
})
