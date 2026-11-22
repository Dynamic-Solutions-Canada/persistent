/** Pure checks for the Play phone-screenshot plan and validation, plus the real approved files. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
// @ts-expect-error - dependency-free Node script has no generated declarations
import { PlayImages } from './play-images.mjs'
// @ts-expect-error - dependency-free Node script has no generated declarations
import { PlayMetadata } from './play-metadata.mjs'

/** Minimal valid PNG header: signature + IHDR with the given size and colour type. */
function fakePng(width: number, height: number, colorType = 2): Buffer {
  const buf = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12)
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  buf.writeUInt8(8, 24)
  buf.writeUInt8(colorType, 25)
  return buf
}

/** Minimal JPEG: SOI, an APP0 segment to step over, then a baseline SOF0 frame header. */
function fakeJpeg(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00])
  const sof = Buffer.alloc(11)
  sof.writeUInt16BE(0xffc0, 0)
  sof.writeUInt16BE(9, 2)
  sof.writeUInt8(8, 4)
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof])
}

const manifestPath = fileURLToPath(
  new URL('../../../store-assets/manifest.json', import.meta.url),
)

test('reads PNG and JPEG sizes and their upload content types', () => {
  assert.deepEqual(PlayImages.imageInfo(fakePng(1080, 1920)), {
    contentType: 'image/png',
    width: 1080,
    height: 1920,
  })
  assert.deepEqual(PlayImages.imageInfo(fakeJpeg(1080, 1920)), {
    contentType: 'image/jpeg',
    width: 1080,
    height: 1920,
  })
  assert.equal(PlayImages.imageInfo(Buffer.from('GIF89a, not allowed')), null)
})

test('accepts a valid mixed set and names every problem per file', () => {
  const good = [
    { name: 'a.png', bytes: fakePng(1080, 1920) },
    { name: 'b.jpg', bytes: fakeJpeg(1920, 1080) },
  ]
  assert.deepEqual(PlayImages.screenshotProblems(good), [])

  const problems: string[] = PlayImages.screenshotProblems([
    { name: 'gif.png', bytes: Buffer.from('GIF89a') },
    { name: 'small.png', bytes: fakePng(319, 600) },
    { name: 'large.jpg', bytes: fakeJpeg(1080, 3841) },
    { name: 'tall.png', bytes: fakePng(1000, 2001) },
    { name: 'edge.png', bytes: fakePng(1000, 2000) },
  ])
  assert.ok(problems.some((p) => /^gif\.png: not a PNG or JPEG/.test(p)))
  assert.ok(problems.some((p) => /^small\.png: .*320-3840/.test(p)))
  assert.ok(problems.some((p) => /^large\.jpg: .*320-3840/.test(p)))
  assert.ok(problems.some((p) => /^tall\.png: .*at most 2x/.test(p)))
  assert.ok(
    !problems.some((p) => p.startsWith('edge.png')),
    'exactly 2:1 is allowed',
  )
})

test('enforces the per-type count of 2 to 8', () => {
  const shot = (i: number) => ({ name: `${i}.png`, bytes: fakePng(1080, 1920) })
  const count = (n: number) =>
    PlayImages.screenshotProblems(Array.from({ length: n }, (_, i) => shot(i)))
  assert.deepEqual(count(8), [])
  assert.match(count(9)[0], /2-8 phone screenshots; found 9/)
  assert.match(count(1)[0], /2-8 phone screenshots; found 1/)
})

test('manifest screenshots keep manifest order and refuse unexpected paths', () => {
  assert.deepEqual(
    PlayImages.manifestScreenshots({
      play: [{ file: 'play/02-b.png' }, { file: 'play/00-a.jpg' }],
      microsoft: [{ file: 'screenshots/ignored.png' }],
    }),
    ['play/02-b.png', 'play/00-a.jpg'],
  )
  for (const manifest of [
    {},
    { play: [] },
    { play: [{ file: '../secret.png' }] },
    { play: [{ file: 'play/graphics/icon.png' }] },
    { play: [{ file: 'play/a.png' }, { file: 'play/a.png' }] },
  ]) {
    assert.throws(() => PlayImages.manifestScreenshots(manifest))
  }
})

test('the plan puts the files on en-US only and empties the other languages so they inherit (D-098)', () => {
  const shots = [{ name: 'play/00.png' }, { name: 'play/01.png' }]
  const plan = PlayImages.plan(PlayMetadata.languages, shots)
  assert.deepEqual(
    plan.map((entry: { language: string }) => entry.language),
    PlayMetadata.languages,
  )
  for (const entry of plan) {
    assert.equal(entry.imageType, 'phoneScreenshots')
    assert.deepEqual(entry.shots, entry.language === 'en-US' ? shots : [])
  }
  assert.throws(() => PlayImages.plan(PlayMetadata.languages, []))
  assert.throws(() => PlayImages.plan(['fr-FR', 'de-DE'], shots), /en-US/)
})

test('the approved manifest files are publishable as they are committed', () => {
  const shots = PlayImages.loadScreenshots(manifestPath)
  assert.equal(shots.length, 8)
  assert.equal(shots[0].name, 'play/00-current-dark.png')
  for (const shot of shots) {
    assert.equal(shot.contentType, 'image/png')
    assert.deepEqual([shot.width, shot.height], [1080, 1920])
  }
})
