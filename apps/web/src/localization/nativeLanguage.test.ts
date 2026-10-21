import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { NativeLanguageState, Locale } from '@persistent/shared'
import { connectNativeLanguage, type NativeLanguageBridge } from './nativeLanguage.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const snapshot = (languageOverride: Locale | null): NativeLanguageState => ({ version: 1, languageOverride, deviceLanguages: ['en-CA'] })
const settle = async () => { await new Promise<void>((resolve) => setImmediate(resolve)) }

/** A delayed bridge models a live WebView's native round trip and native configuration events. */
function fixture(read: NativeLanguageBridge['getLocale'], retryDelay?: number) {
  let event!: (value: NativeLanguageState) => void
  let ready = false
  let language: Locale | null = 'de-DE'
  const writes: (Locale | null)[] = []
  const bridge: NativeLanguageBridge = {
    getLocale: read,
    async addListener(_name, listener) { event = listener; return { async remove() {} } }
  }
  const connection = connectNativeLanguage(bridge, language, {
    apply(value) { language = value.languageOverride }, ready() { ready = true }
  }, retryDelay)
  return {
    connection, writes, event: (value: NativeLanguageState) => event(value),
    publish() { if (ready) writes.push(language) },
    get language() { return language }, get ready() { return ready }
  }
}

test('a supported slow read never publishes stale web language, and its eventual result applies', async (context) => {
  const read = deferred<NativeLanguageState>()
  const app = fixture(() => read.promise)
  context.after(() => app.connection.dispose())
  await settle()
  // Native response remains pending past any caller's rendering or timeout cycles.
  app.publish()
  await settle()
  app.publish()
  assert.equal(app.ready, false)
  assert.deepEqual(app.writes, [])
  read.resolve(snapshot('fr-CA'))
  await settle()
  app.publish()
  assert.deepEqual(app.writes, ['fr-CA'])
})

test('a system event fences an older startup read and native write echoes converge', async (context) => {
  const read = deferred<NativeLanguageState>()
  const app = fixture(() => read.promise)
  context.after(() => app.connection.dispose())
  await settle()
  app.event(snapshot('ja-JP'))
  app.publish()
  read.resolve(snapshot('fr-CA'))
  await settle()
  assert.equal(app.language, 'ja-JP')
  // The native write causes a configuration/resume echo of the same authoritative choice.
  app.event(snapshot('ja-JP'))
  app.publish()
  assert.deepEqual(app.writes, ['ja-JP', 'ja-JP'])
  assert.equal(app.language, 'ja-JP')
})

test('transient read failure retries without publishing; only definitive unsupported hosts enable legacy publishing', async (context) => {
  let reads = 0
  const app = fixture(async () => {
    reads += 1
    if (reads === 1) throw { code: 'UNAVAILABLE' }
    return snapshot(null)
  }, 50)
  context.after(() => app.connection.dispose())
  await settle()
  app.publish()
  assert.deepEqual(app.writes, [])
  await new Promise((resolve) => setTimeout(resolve, 75))
  app.publish()
  assert.deepEqual(app.writes, [null])
  const oldHost = fixture(async () => { throw { code: 'UNIMPLEMENTED' } })
  context.after(() => oldHost.connection.dispose())
  await settle()
  oldHost.publish()
  assert.deepEqual(oldHost.writes, ['de-DE'])
})

test('manual choices and disposal fence delayed startup responses', async () => {
  const read = deferred<NativeLanguageState>()
  const app = fixture(() => read.promise)
  await settle()
  app.connection.manualChoice()
  read.resolve(snapshot('fr-FR'))
  await settle()
  assert.equal(app.language, 'de-DE')
  app.connection.dispose()
  app.event(snapshot('ja-JP'))
  assert.equal(app.language, 'de-DE')
})

test('subscription failures warn once without secrets, retry and reconcile a missed OS choice', async () => {
  const subscribed = deferred<void>()
  let attempts = 0
  let reads = 0
  let applied: Locale | null = null
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (value: unknown) => { warnings.push(String(value)) }
  const connection = connectNativeLanguage({
    async addListener() {
      attempts += 1
      if (attempts < 3) throw new Error('private provider detail must not be logged')
      subscribed.resolve()
      return { async remove() {} }
    },
    async getLocale() {
      reads += 1
      return snapshot(reads === 1 ? 'fr-FR' : 'ja-JP')
    }
  }, 'de-DE', { apply: (value) => { applied = value.languageOverride }, ready() {} }, 10)
  try {
    await subscribed.promise
    await settle()
    assert.equal(reads, 2)
    assert.equal(applied, 'ja-JP')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /subscription failed/)
    assert.ok(!warnings[0]!.includes('private provider'))
  } finally {
    connection.dispose()
    console.warn = originalWarn
  }
})
