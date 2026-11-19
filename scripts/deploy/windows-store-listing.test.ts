/** Store asset updates must preserve unrelated listing and submission policy. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error - the dependency-free release runner module is plain JavaScript.
import {
  mergeStoreListing,
  assertReleasePackage,
} from './windows-store-listing.mjs'

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

test('Store screenshot refresh preserves packages, logos, policy, other languages and source draft', () => {
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
      'fr-ca': { BaseListing: { Description: 'Existing translation' } },
    },
  }
  const shots = Array.from({ length: 4 }, (_, index) => ({
    file: `microsoft/${index}.png`,
    alt: `View ${index}`,
  }))
  const result = mergeStoreListing(draft, shots, {
    'en-US': 'A taller flyout.',
    'fr-CA': 'Un menu plus haut.',
  })
  assert.equal(
    draft.Listings['en-us'].BaseListing.Images[0].FileStatus,
    'Uploaded',
  )
  assert.deepEqual(
    result.submission.ApplicationPackages,
    draft.ApplicationPackages,
  )
  assert.deepEqual(result.submission.Pricing, draft.Pricing)
  assert.deepEqual(result.submission.Listings['fr-ca'], {
    BaseListing: {
      ...draft.Listings['fr-ca'].BaseListing,
      releaseNotes: 'Un menu plus haut.',
    },
  })
  const listing = result.submission.Listings['en-us'].BaseListing
  assert.equal(listing.Title, 'Persistent')
  assert.equal(listing.Description, 'Keep existing copy')
  assert.equal(listing.Images[0].FileStatus, 'PendingDelete')
  assert.deepEqual(
    listing.Images[1],
    draft.Listings['en-us'].BaseListing.Images[1],
  )
  assert.deepEqual(
    listing.Images.slice(2).map(
      (image: { fileName: string }) => image.fileName,
    ),
    shots.map((_, index) => `en-us/${index}.png`),
  )
  assert.equal(listing.ReleaseNotes, 'A taller flyout.')
})

test('Store updates reject missing English listings and duplicate screenshot filenames', () => {
  const shots = Array.from({ length: 4 }, () => ({
    file: 'microsoft/same.png',
    alt: 'Same',
  }))
  assert.throws(
    () => mergeStoreListing({ listings: {} }, shots, { 'en-US': 'Notes' }),
    /English/,
  )
  assert.throws(
    () =>
      mergeStoreListing(
        { listings: { 'en-us': { baseListing: { images: [] } } } },
        shots,
        { 'en-US': 'Notes' },
      ),
    /unique/,
  )
})

test('every listing gets its own approved notes, and a listing without any fails first', () => {
  const shots = Array.from({ length: 4 }, (_, index) => ({
    file: `microsoft/${index}.png`,
    alt: `View ${index}`,
  }))
  const draft = {
    listings: {
      'en-us': { baseListing: { images: [] } },
      'ja-jp': { baseListing: { releaseNotes: 'Old' } },
    },
  }
  assert.throws(
    () => mergeStoreListing(draft, shots, { 'en-US': 'New' }),
    /No release notes for the ja-jp listing/,
  )
  const result = mergeStoreListing(draft, shots, {
    'en-US': 'New',
    'ja-JP': '新しい通知。',
  })
  assert.equal(
    result.submission.listings['ja-jp'].baseListing.releaseNotes,
    '新しい通知。',
  )
  assert.throws(
    () =>
      mergeStoreListing(
        { listings: { 'en-us': { baseListing: { images: [] } } } },
        shots,
        {
          'en-US': 'x'.repeat(1501),
        },
      ),
    /over 1500/,
  )
})
