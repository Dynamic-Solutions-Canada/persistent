/** Validate real Store sources and atomic text-only edits without credentials or a live Play app. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { supportedLocales } from '../../../packages/shared/src/locales.js'
// @ts-expect-error - dependency-free Node script has no generated declarations
import { PlayMetadata } from './play-metadata.mjs'
// @ts-expect-error - dependency-free Node script has no generated declarations
import { PlayImages } from './play-images.mjs'
// @ts-expect-error - dependency-free Node script has no generated declarations
import { listingFromJson } from './play-publish.mjs'
// @ts-expect-error - dependency-free Node script has no generated declarations
import { playJson } from '../../../scripts/release/notes.mjs'

const source = JSON.parse(
  readFileSync(
    new URL('../../../store-assets/play/listings.json', import.meta.url),
    'utf8',
  ),
)
// The 0.29.0 notes as release.yml hands them to Play, built from release-notes/.
const notes = playJson('product', '0.29.0')

test('real listing and release notes cover exactly the app locales within every Play cap', () => {
  assert.deepEqual(PlayMetadata.languages, [...supportedLocales])
  const listings = PlayMetadata.listings(source)
  assert.equal(listings.length, 9)
  assert.deepEqual({ ...listings[1], language: 'en-US' }, listings[0])
  assert.deepEqual({ ...listings[4], language: 'fr-FR' }, listings[3])
  const releaseNotes = PlayMetadata.notes(notes, '0.29.0')
  assert.equal(releaseNotes.length, 9)
  assert.match(
    releaseNotes[0].text,
    /Shared members.*Undo.*drafts.*Concurrent edits/,
  )
  for (const listing of listings) {
    assert.match(listing.fullDescription, /persistent.dynamic-solutions.ca/)
    assert.ok(listing.title.startsWith('Persistent'))
  }
  // The legacy screenshot mode reads the same English copy the localized publisher sends.
  const english = listingFromJson(source)
  assert.equal(english.shortDescription, listings[0].shortDescription)
  assert.equal(english.fullDescription, listings[0].fullDescription)
})

test('incomplete, unknown, over-limit and cyclic metadata fails before opening any edit', () => {
  for (const mutate of [
    (copy: typeof source) => {
      delete copy.locales['ja-JP']
    },
    (copy: typeof source) => {
      copy.locales['zh-TW'] = copy.locales['zh-CN']
    },
    (copy: typeof source) => {
      copy.locales['en-US'].title = 'x'.repeat(31)
    },
    (copy: typeof source) => {
      copy.locales['ja-JP'].shortDescription = '薬'.repeat(81)
    },
    (copy: typeof source) => {
      copy.locales['en-US'].fullDescription = 'x'.repeat(4001)
    },
    (copy: typeof source) => {
      copy.locales['en-US'].video = 'https://unwanted'
    },
    (copy: typeof source) => {
      copy.locales['en-US'] = { copyFrom: 'en-CA' }
    },
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
  /** Image count Play reports after uploads; null means it counts the uploads honestly. */
  stagedImages: number | null = null
  uploads = 0
  async request(
    path: string,
    options: { method?: string; body?: Record<string, unknown> } = {},
  ) {
    const method = options.method ?? 'GET'
    this.calls.push({ path, method, body: options.body })
    if (path === '/edits') return { id: 'fixture' }
    if (path.includes('/phoneScreenshots')) {
      if (method === 'DELETE') this.uploads = 0
      if (method === 'POST') this.uploads++
      const count = this.stagedImages ?? this.uploads
      return { images: Array.from({ length: count }, () => ({})) }
    }
    if (method === 'GET')
      return {
        listings: [
          {
            language: 'en-US',
            title: 'Current',
            video: 'https://youtu.be/existing',
          },
          { language: 'it-IT', title: 'Unrelated translation' },
        ],
      }
    if (path.endsWith(`/${this.failLanguage}`))
      throw new Error('Synthetic write failure')
    return {}
  }
  async run(check: boolean, images: unknown = null) {
    await PlayMetadata.publishListings({
      listings: PlayMetadata.listings(source),
      request: this.request.bind(this),
      editPath: '/edits',
      check,
      images,
      report: () => {},
      commit: async () => {
        this.calls.push({ path: '/edits/fixture:commit', method: 'POST' })
      },
    })
  }
}

test('one atomic edit patches existing text, creates translations and preserves videos/images/details/countries', async () => {
  const fixture = new PlayEditFixture()
  await fixture.run(false)
  const writes = fixture.calls.filter((call) =>
    ['PATCH', 'PUT'].includes(call.method),
  )
  assert.equal(writes.length, 9)
  assert.equal(writes[0].method, 'PATCH')
  assert.equal(writes[1].method, 'PUT')
  for (const write of writes) {
    assert.deepEqual(Object.keys(write.body!).sort(), [
      'fullDescription',
      'language',
      'shortDescription',
      'title',
    ])
    assert.ok(!write.path.includes('it-IT'))
  }
  assert.equal(
    fixture.calls.filter((call) => call.path.endsWith(':commit')).length,
    1,
  )
  assert.ok(
    fixture.calls.every(
      (call) => !/images|Screenshots|details|country/.test(call.path),
    ),
  )
})

test('check writes no text and removes its edit; partial failure never commits', async () => {
  const check = new PlayEditFixture()
  await check.run(true)
  assert.deepEqual(
    check.calls.map((call) => call.method),
    ['POST', 'GET', 'DELETE'],
  )
  const failure = new PlayEditFixture()
  failure.failLanguage = 'de-DE'
  await assert.rejects(failure.run(false), /Synthetic write failure/)
  assert.equal(failure.calls.at(-1)!.method, 'DELETE')
  assert.ok(failure.calls.every((call) => !call.path.endsWith(':commit')))
})

test('an image plan gives each language its own set after the text, verifies counts and commits once', async () => {
  const sources = PlayMetadata.sources(source)
  const sets = new Map(
    [...new Set<string>(sources.values())].map((locale) => [
      locale,
      ['a', 'b', 'c'].map((name) => ({
        name: `play/${locale}/${name}.png`,
        bytes: Buffer.from(name),
        contentType: 'image/png',
      })),
    ]),
  )
  const plan = PlayImages.plan(PlayMetadata.languages, sets, sources)
  const fixture = new PlayEditFixture()
  await fixture.run(false, plan)

  const lastText = fixture.calls.findLastIndex((call) =>
    ['PATCH', 'PUT'].includes(call.method),
  )
  const firstImageWrite = fixture.calls.findIndex(
    (call) => call.method !== 'GET' && call.path.includes('phoneScreenshots'),
  )
  assert.ok(firstImageWrite > lastText, 'text first, so new languages exist')
  const uploads = fixture.calls.filter(
    (call) => call.method === 'POST' && call.path.startsWith('/upload/'),
  )
  // Every language gets its own three files, each set cleared first.
  assert.equal(uploads.length, 9 * 3)
  for (const language of PlayMetadata.languages)
    assert.equal(
      uploads.filter((call) => call.path.includes(`/listings/${language}/`))
        .length,
      3,
    )
  assert.equal(
    fixture.calls.filter(
      (call) =>
        call.method === 'DELETE' && call.path.endsWith('/phoneScreenshots'),
    ).length,
    9,
  )
  assert.ok(!fixture.calls.some((call) => call.path.includes('it-IT')))
  assert.equal(
    fixture.calls.filter((call) => call.path.endsWith(':commit')).length,
    1,
  )

  // Check mode reads only languages Play already has and writes no image.
  const check = new PlayEditFixture()
  await check.run(true, plan)
  assert.deepEqual(
    check.calls.map((call) => `${call.method} ${call.path}`),
    [
      'POST /edits',
      'GET /edits/fixture/listings',
      'GET /edits/fixture/listings/en-US/phoneScreenshots',
      'DELETE /edits/fixture',
    ],
  )

  // A short count after upload aborts without committing.
  const short = new PlayEditFixture()
  short.stagedImages = 2
  await assert.rejects(short.run(false, plan), /holds 2 after upload/)
  assert.equal(short.calls.at(-1)!.method, 'DELETE')
  assert.ok(short.calls.every((call) => !call.path.endsWith(':commit')))
})

test('frame text stays local: never sent to Play, resolved for aliases, lengths checked', () => {
  for (const listing of PlayMetadata.listings(source)) {
    assert.deepEqual(Object.keys(listing).sort(), [
      'fullDescription',
      'language',
      'shortDescription',
      'title',
    ])
  }
  const frames = PlayMetadata.frameText(source)
  const frCa = frames.find(
    (frame: { language: string }) => frame.language === 'fr-CA',
  )
  assert.deepEqual(frCa.headlines, source.locales['fr-FR'].screenshotHeadlines)
  for (const frame of frames)
    assert.equal(frame.headlines.length, frame.captions.length)

  const short = structuredClone(source)
  short.locales['de-DE'].screenshotCaptions.pop()
  assert.throws(
    () => PlayMetadata.frameText(short),
    /de-DE: 8 screenshot headlines for 7 captions/,
  )
})
