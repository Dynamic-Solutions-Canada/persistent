/** Store asset updates must preserve unrelated listing and submission policy. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error - the dependency-free release runner module is plain JavaScript.
import {
  mergeStoreListing,
  assertReleasePackage,
} from './windows-store-listing.mjs'
// @ts-expect-error - the dependency-free release runner module is plain JavaScript.
import { resolveStoreScreenshots } from './windows-store-screenshots.mjs'

/** The plan for a draft's listing locales: four shared screenshots, captioned per locale. */
function planFor(locales: string[]) {
  const manifest = {
    microsoft: Array.from({ length: 4 }, (_, index) => ({
      file: `screenshots/0${index}.png`,
    })),
  }
  const captions = (prefix: string) =>
    Array.from({ length: 4 }, (_, index) => `${prefix} ${index}`)
  const listings = {
    locales: {
      'en-US': { screenshotCaptions: captions('View') },
      'fr-FR': { screenshotCaptions: captions('Vue') },
      'fr-CA': { copyFrom: 'fr-FR' },
      'ja-JP': { screenshotCaptions: captions('画面') },
    },
  }
  return resolveStoreScreenshots(manifest, listings, locales)
}

test('Store package guard matches the CLI upload wrapper rather than its nested bundle', () => {
  const draft = {
    applicationPackages: [
      {
        fileName: 'Persistent.Desktop_0.5.8.msixupload',
        fileStatus: 'PendingUpload',
      },
    ],
  }
  assert.doesNotThrow(() =>
    assertReleasePackage(draft, 'Persistent.Desktop_0.5.8.msixupload'),
  )
  assert.throws(
    () => assertReleasePackage(draft, 'Persistent.Desktop_0.5.8.msixbundle'),
    /selected release package/,
  )
  assert.throws(
    () => assertReleasePackage(draft, 'Persistent.Desktop_0.5.7.msixupload'),
    /selected release package/,
  )
})

test('Store screenshot refresh preserves packages, logos, policy, copy and the source draft', () => {
  const draft = {
    ApplicationPackages: [
      { FileName: 'release.msixbundle', FileStatus: 'PendingUpload' },
    ],
    Pricing: { PriceId: 'Free' },
    TargetPublishMode: 'Immediate',
    Listings: {
      'en-us': {
        BaseListing: {
          Title: 'Persistent',
          Description: 'Keep existing copy',
          ReleaseNotes: 'Old notes',
          Images: [
            {
              FileName: 'old.png',
              FileStatus: 'Uploaded',
              ImageType: 'Screenshot',
            },
            { FileName: 'logo.png', FileStatus: 'Uploaded', ImageType: 'Icon' },
          ],
        },
      },
      'fr-ca': {
        BaseListing: { Description: 'Existing translation', Images: [] },
      },
    },
  }
  const plan = planFor(Object.keys(draft.Listings))
  const result = mergeStoreListing(draft, plan, {
    'en-US': 'A taller flyout.',
    'fr-CA': 'Un menu plus haut.',
  })
  assert.equal(
    draft.Listings['en-us'].BaseListing.Images[0].FileStatus,
    'Uploaded',
  )
  assert.deepEqual(result.ApplicationPackages, draft.ApplicationPackages)
  assert.deepEqual(result.Pricing, draft.Pricing)
  assert.equal(result.TargetPublishMode, 'Immediate')

  const english = result.Listings['en-us'].BaseListing
  assert.equal(english.Title, 'Persistent')
  assert.equal(english.Description, 'Keep existing copy')
  assert.equal(english.ReleaseNotes, 'A taller flyout.')
  // Logos as they were, then the new set in order, then the removed screenshot.
  assert.deepEqual(
    english.Images[0],
    draft.Listings['en-us'].BaseListing.Images[1],
  )
  assert.deepEqual(
    english.Images.slice(1, 5).map(
      (image: { fileName: string }) => image.fileName,
    ),
    ['en-us/00.png', 'en-us/01.png', 'en-us/02.png', 'en-us/03.png'],
  )
  assert.equal(english.Images[5].FileName, 'old.png')
  assert.equal(english.Images[5].FileStatus, 'PendingDelete')

  const french = result.Listings['fr-ca'].BaseListing
  assert.equal(french.Description, 'Existing translation')
  assert.equal(french.releaseNotes, 'Un menu plus haut.')
  assert.deepEqual(
    french.Images.map((image: { description: string }) => image.description),
    ['Vue 0', 'Vue 1', 'Vue 2', 'Vue 3'],
  )
})

test('Store updates reject a draft without an English listing', () => {
  assert.throws(
    () =>
      mergeStoreListing({ listings: {} }, planFor(['en-US']), {
        'en-US': 'Notes',
      }),
    /English/,
  )
})

test('every listing gets its own approved notes, and a listing without any fails first', () => {
  const draft = {
    listings: {
      'en-us': { baseListing: { images: [] } },
      'ja-jp': { baseListing: { releaseNotes: 'Old', images: [] } },
    },
  }
  const plan = planFor(['en-us', 'ja-jp'])
  assert.throws(
    () => mergeStoreListing(draft, plan, { 'en-US': 'New' }),
    /No release notes for the ja-jp listing/,
  )
  const result = mergeStoreListing(draft, plan, {
    'en-US': 'New',
    'ja-JP': '新しい通知。',
  })
  assert.equal(
    result.listings['ja-jp'].baseListing.releaseNotes,
    '新しい通知。',
  )
  assert.throws(
    () =>
      mergeStoreListing(
        { listings: { 'en-us': { baseListing: { images: [] } } } },
        planFor(['en-us']),
        { 'en-US': 'x'.repeat(1501) },
      ),
    /over 1500/,
  )
})
