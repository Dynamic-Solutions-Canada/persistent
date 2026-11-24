/** Every listing locale gets its own hero first, then the shared screenshots, in display order (D-123). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  archiveRoots,
  confirmStoreScreenshots,
  mergeStoreScreenshots,
  resolveStoreScreenshots,
  // @ts-expect-error - the dependency-free release runner module is plain JavaScript.
} from './windows-store-screenshots.mjs'

interface Image {
  fileName: string
  fileStatus: string
  imageType: string
  description?: string
}

/** A hero and two shared screenshots, with three listing records and two copyFrom aliases. */
function fixture() {
  const manifest = {
    microsoft: [
      {
        file: 'screenshots/{locale}/00-hero-dark.png',
        hero: { layout: 'split' },
      },
      { file: 'screenshots/01-current-dark.png' },
      { file: 'screenshots/02-checklist-dark.png' },
    ],
  }
  const listings = {
    locales: {
      'en-US': { screenshotCaptions: ['Hero', 'Current', 'Checklist'] },
      'en-CA': { copyFrom: 'en-US' },
      'fr-FR': { screenshotCaptions: ['Héros', 'Actuels', 'Liste'] },
      'fr-CA': { copyFrom: 'fr-FR' },
      'ja-JP': { screenshotCaptions: ['ヒーロー', '現在', 'リスト'] },
    },
  }
  return { manifest, listings }
}

test('each locale gets its own hero, a copyFrom locale its target hero, then the shared set', () => {
  const { manifest, listings } = fixture()
  const plan = resolveStoreScreenshots(manifest, listings, [
    'en-us',
    'en-ca',
    'fr-CA',
    'ja-jp',
  ])
  assert.deepEqual(plan.locales.get('en-ca'), [
    {
      source: 'microsoft/screenshots/en-US/00-hero-dark.png',
      fileName: 'en-ca/00-hero-dark.png',
      description: 'Hero',
    },
    {
      source: 'microsoft/screenshots/01-current-dark.png',
      fileName: 'en-ca/01-current-dark.png',
      description: 'Current',
    },
    {
      source: 'microsoft/screenshots/02-checklist-dark.png',
      fileName: 'en-ca/02-checklist-dark.png',
      description: 'Checklist',
    },
  ])
  assert.equal(
    plan.locales.get('fr-ca')[0].source,
    'microsoft/screenshots/fr-FR/00-hero-dark.png',
  )
  assert.equal(plan.locales.get('fr-ca')[1].description, 'Actuels')
  assert.equal(
    plan.locales.get('ja-jp')[0].source,
    'microsoft/screenshots/ja-JP/00-hero-dark.png',
  )
  assert.equal(plan.files.length, 12)
  assert.deepEqual(plan.fallback, [])
})

test('a listing locale without a record takes the en-US set and is reported', () => {
  const { manifest, listings } = fixture()
  const plan = resolveStoreScreenshots(manifest, listings, ['en-us', 'it-it'])
  assert.deepEqual(plan.fallback, ['it-it'])
  assert.deepEqual(
    plan.locales
      .get('it-it')
      .map((image: { source: string }) => image.source)
      .slice(0, 1),
    ['microsoft/screenshots/en-US/00-hero-dark.png'],
  )
  assert.equal(plan.locales.get('it-it')[0].fileName, 'it-it/00-hero-dark.png')
})

test('planning stops on a caption gap, an empty caption, a count out of range or a shared name', () => {
  const { manifest, listings } = fixture()
  const short = structuredClone(listings)
  short.locales['ja-JP'].screenshotCaptions.pop()
  assert.throws(
    () => resolveStoreScreenshots(manifest, short, ['ja-JP']),
    /ja-JP has 2 screenshot captions for 3/,
  )
  const empty = structuredClone(listings)
  empty.locales['fr-FR'].screenshotCaptions[1] = ' '
  assert.throws(
    () => resolveStoreScreenshots(manifest, empty, ['fr-CA']),
    /fr-FR caption 2/,
  )
  assert.throws(
    () => resolveStoreScreenshots({ microsoft: [] }, listings, ['en-US']),
    /1 to 10/,
  )
  const twice = structuredClone(manifest)
  twice.microsoft[2].file = 'other/01-current-dark.png'
  assert.throws(
    () => resolveStoreScreenshots(twice, listings, ['en-US']),
    /share a file name/,
  )
  const shared = structuredClone(manifest)
  shared.microsoft[1].file = 'screenshots/{locale}/01.png'
  assert.throws(
    () => resolveStoreScreenshots(shared, listings, ['en-US']),
    /Only the hero/,
  )
})

test('merge keeps logos, puts the new set in order before the removed screenshots, and reads back', () => {
  const { manifest, listings } = fixture()
  const submission = {
    listings: {
      'en-us': {
        baseListing: {
          images: [
            {
              fileName: 'old-1.png',
              fileStatus: 'Uploaded',
              imageType: 'Screenshot',
            },
            { fileName: 'logo.png', fileStatus: 'Uploaded', imageType: 'Icon' },
            {
              fileName: 'old-2.png',
              fileStatus: 'Uploaded',
              imageType: 'Screenshot',
            },
          ],
        },
      },
      'fr-ca': { baseListing: { images: [] } },
    },
  }
  const plan = resolveStoreScreenshots(
    manifest,
    listings,
    Object.keys(submission.listings),
  )
  mergeStoreScreenshots(submission, plan)
  const images: Image[] = submission.listings['en-us'].baseListing.images
  assert.deepEqual(
    images.map((image) => [image.fileName, image.fileStatus]),
    [
      ['logo.png', 'Uploaded'],
      ['en-us/00-hero-dark.png', 'PendingUpload'],
      ['en-us/01-current-dark.png', 'PendingUpload'],
      ['en-us/02-checklist-dark.png', 'PendingUpload'],
      ['old-1.png', 'PendingDelete'],
      ['old-2.png', 'PendingDelete'],
    ],
  )
  assert.equal(images[1].description, 'Hero')
  assert.doesNotThrow(() => confirmStoreScreenshots(submission, plan))
})

test('merge stops on a draft listing that has no plan', () => {
  const { manifest, listings } = fixture()
  const plan = resolveStoreScreenshots(manifest, listings, ['en-us'])
  assert.throws(
    () =>
      mergeStoreScreenshots(
        { listings: { 'de-de': { baseListing: { images: [] } } } },
        plan,
      ),
    /No screenshots were planned for the de-de listing/,
  )
})

test('read-back fails when the Store reorders, drops or keeps an extra screenshot', () => {
  const { manifest, listings } = fixture()
  const plan = resolveStoreScreenshots(manifest, listings, ['en-us'])
  const planned = () =>
    plan.locales.get('en-us').map((image: { fileName: string }) => ({
      FileName: image.fileName,
      FileStatus: 'PendingUpload',
      ImageType: 'Screenshot',
    }))
  const read = (images: object[]) => ({
    Listings: { 'en-us': { BaseListing: { Images: images } } },
  })
  const removed = {
    FileName: 'old.png',
    FileStatus: 'PendingDelete',
    ImageType: 'Screenshot',
  }
  const logo = {
    FileName: 'logo.png',
    FileStatus: 'Uploaded',
    ImageType: 'Icon',
  }

  // PascalCase, as the Store CLI returns it, with the removed one after: in order.
  assert.doesNotThrow(() =>
    confirmStoreScreenshots(read([logo, ...planned(), removed]), plan),
  )
  // Removed first: the displayed order is scrambled.
  assert.throws(
    () => confirmStoreScreenshots(read([removed, ...planned()]), plan),
    /display order, for en-us/,
  )
  const swapped = planned()
  ;[swapped[1], swapped[2]] = [swapped[2], swapped[1]]
  assert.throws(() => confirmStoreScreenshots(read(swapped), plan), /en-us/)
  assert.throws(
    () => confirmStoreScreenshots(read(planned().slice(1)), plan),
    /en-us/,
  )
  const kept = { ...removed, FileStatus: 'Uploaded' }
  assert.throws(
    () => confirmStoreScreenshots(read([...planned(), kept]), plan),
    /en-us/,
  )
})

test('the upload archive holds the package and one folder per locale', () => {
  const { manifest, listings } = fixture()
  const plan = resolveStoreScreenshots(manifest, listings, [
    'ja-jp',
    'en-us',
    'fr-ca',
  ])
  assert.deepEqual(
    archiveRoots('Persistent.Desktop_1.0.0.msixupload', plan.files),
    ['Persistent.Desktop_1.0.0.msixupload', 'en-us', 'fr-ca', 'ja-jp'],
  )
})
