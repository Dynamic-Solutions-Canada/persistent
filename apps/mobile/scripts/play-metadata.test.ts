/** Validate real Store sources and atomic text-only edits without credentials or a live Play app. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { supportedLocales } from '../../../packages/shared/src/locales.js'
// @ts-expect-error - dependency-free Node script has no generated declarations
import { PlayMetadata } from './play-metadata.mjs'
// @ts-expect-error - dependency-free Node script has no generated declarations
import { listingFromMarkdown } from './play-publish.mjs'

const source = JSON.parse(readFileSync(new URL('../store/listings.json', import.meta.url), 'utf8'))
const notes = JSON.parse(readFileSync(new URL('../store/releases/0.29.0.json', import.meta.url), 'utf8'))

test('real listing and release notes cover exactly the app locales within every Play cap', () => {
  assert.deepEqual(PlayMetadata.languages, [...supportedLocales])
  const listings = PlayMetadata.listings(source)
  assert.equal(listings.length, 9)
  assert.deepEqual({ ...listings[1], language: 'en-US' }, listings[0])
  assert.deepEqual({ ...listings[4], language: 'fr-FR' }, listings[3])
  const releaseNotes = PlayMetadata.notes(notes, '0.29.0')
  assert.equal(releaseNotes.length, 9)
  assert.match(releaseNotes[0].text, /Shared members.*Undo.*drafts.*Concurrent edits/)
  for (const listing of listings) {
    assert.match(listing.fullDescription, /persistent.dynamic-solutions.ca/)
    assert.ok(listing.title.startsWith('Persistent'))
  }
  const preview = listingFromMarkdown(readFileSync(new URL('../store/listing.md', import.meta.url), 'utf8'))
  assert.equal(preview.shortDescription, listings[0].shortDescription)
  assert.equal(preview.fullDescription, listings[0].fullDescription)
})

test('incomplete, unknown, over-limit and cyclic metadata fails before opening any edit', () => {
  for (const mutate of [
    (copy: typeof source) => { delete copy.locales['ja-JP'] },
    (copy: typeof source) => { copy.locales['zh-TW'] = copy.locales['zh-CN'] },
    (copy: typeof source) => { copy.locales['en-US'].title = 'x'.repeat(31) },
    (copy: typeof source) => { copy.locales['ja-JP'].shortDescription = '薬'.repeat(81) },
    (copy: typeof source) => { copy.locales['en-US'].fullDescription = 'x'.repeat(4001) },
    (copy: typeof source) => { copy.locales['en-US'].video = 'https://unwanted' },
    (copy: typeof source) => { copy.locales['en-US'] = { copyFrom: 'en-CA' } }
  ]) {
    const copy = structuredClone(source)
    mutate(copy)
    assert.throws(() => PlayMetadata.listings(copy))
  }
  assert.throws(() => PlayMetadata.notes(notes, '0.30.0'), /versionName/)
  const tooLong = structuredClone(notes)
  tooLong.locales['ja-JP'].text = '薬'.repeat(501)
  assert.throws(() => PlayMetadata.notes(tooLong, '0.29.0'), /1-500/)
})

/** Minimal edit fixture records actual resource writes and preserves unrelated resources. */
class PlayEditFixture {
  calls: { path: string; method: string; body?: Record<string, unknown> }[] = []
  failLanguage: string | null = null
  async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
    const method = options.method ?? 'GET'
    this.calls.push({ path, method, body: options.body })
    if (path === '/edits') return { id: 'fixture' }
    if (method === 'GET') return { listings: [
      { language: 'en-US', title: 'Current', video: 'https://youtu.be/existing' },
      { language: 'it-IT', title: 'Unrelated translation' }
    ] }
    if (path.endsWith(`/${this.failLanguage}`)) throw new Error('Synthetic write failure')
    return {}
  }
  async run(check: boolean) {
    await PlayMetadata.publishListings({ listings: PlayMetadata.listings(source),
      request: this.request.bind(this), editPath: '/edits', check, report: () => {},
      commit: async () => { this.calls.push({ path: '/edits/fixture:commit', method: 'POST' }) }
    })
  }
}

test('one atomic edit patches existing text, creates translations and preserves videos/images/details/countries', async () => {
  const fixture = new PlayEditFixture()
  await fixture.run(false)
  const writes = fixture.calls.filter((call) => ['PATCH', 'PUT'].includes(call.method))
  assert.equal(writes.length, 9)
  assert.equal(writes[0].method, 'PATCH')
  assert.equal(writes[1].method, 'PUT')
  for (const write of writes) {
    assert.deepEqual(Object.keys(write.body!).sort(), ['fullDescription', 'language', 'shortDescription', 'title'])
    assert.ok(!write.path.includes('it-IT'))
  }
  assert.equal(fixture.calls.filter((call) => call.path.endsWith(':commit')).length, 1)
  assert.ok(fixture.calls.every((call) => !/images|Screenshots|details|country/.test(call.path)))
})

test('check writes no text and removes its edit; partial failure never commits', async () => {
  const check = new PlayEditFixture()
  await check.run(true)
  assert.deepEqual(check.calls.map((call) => call.method), ['POST', 'GET', 'DELETE'])
  const failure = new PlayEditFixture()
  failure.failLanguage = 'de-DE'
  await assert.rejects(failure.run(false), /Synthetic write failure/)
  assert.equal(failure.calls.at(-1)!.method, 'DELETE')
  assert.ok(failure.calls.every((call) => !call.path.endsWith(':commit')))
})
