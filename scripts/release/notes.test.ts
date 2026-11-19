import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  checkAll,
  IDENTITIES,
  listingTexts,
  playJson,
  problems,
  requireNotes,
  storeLength,
} from './notes.mjs'

/** A notes folder holding the given files. */
function folder(files: Record<string, string>) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'release-notes-'))
  for (const [name, text] of Object.entries(files))
    writeFileSync(path.join(root, name), text)
  return root
}

/** Every wording of one lane version, each with the given text. */
function complete(prefix: string, version: string, text = 'Fixes a crash.') {
  return Object.fromEntries(
    IDENTITIES.map((identity) => [
      `${prefix}${version}${identity === 'en-US' ? '' : `.${identity}`}.md`,
      `${text}\n`,
    ]),
  )
}

test('length counts characters, not bytes: a CJK note at the limit passes and one over fails', () => {
  const atLimit = '提'.repeat(500)
  const overLimit = '提'.repeat(501)
  assert.equal(storeLength(atLimit), 500)
  assert.equal(
    Buffer.byteLength(atLimit),
    1500,
    'the UTF-8 size is three times the count',
  )

  const files = complete('android-', '1.0.0')
  files['android-1.0.0.zh-CN.md'] = atLimit
  files['android-1.0.0.ja-JP.md'] = 'お'.repeat(500)
  assert.deepEqual(checkAll(folder(files)), [])

  files['android-1.0.0.zh-CN.md'] = overLimit
  assert.deepEqual(checkAll(folder(files)), [
    'android-1.0.0.zh-CN.md is 501 characters; the limit is 500',
  ])
})

test('the desktop lane allows the Microsoft Store limit of 1,500', () => {
  const files = complete('desktop-', '1.0.0')
  files['desktop-1.0.0.ja-JP.md'] = 'お'.repeat(1500)
  assert.deepEqual(checkAll(folder(files)), [])
  files['desktop-1.0.0.ja-JP.md'] = 'お'.repeat(1501)
  assert.match(
    checkAll(folder(files)).join(),
    /1501 characters; the limit is 1500/,
  )
})

test('a localized lane needs every wording; a missing tagged version is refused, never generated', () => {
  const files = complete('android-', '1.0.0')
  delete files['android-1.0.0.fr-FR.md']
  const root = folder(files)
  assert.deepEqual(checkAll(root), ['android-1.0.0.fr-FR.md is missing'])
  assert.throws(
    () => requireNotes('android', '2.0.0', root),
    /android-2\.0\.0\.md is missing/,
  )
})

test('English-only lanes need only en-US, but a partial set of translations is incomplete', () => {
  assert.deepEqual(
    checkAll(folder({ 'linux-1.0.0.md': 'Faster updates.\n' })),
    [],
  )
  assert.deepEqual(
    problems('product', '1.0.0', {
      'en-US': 'Faster sync.',
      'fr-FR': 'Synchronisation plus rapide.',
    }).length,
    5,
  )
})

test('bodies carry no heading or disclosure line, and odd file names are rejected', () => {
  const root = folder({
    'linux-1.0.0.md':
      '# Persistent 1.0.0\n\n*AI disclosure: written with AI.*\n',
    'notes-1.0.md': 'x',
  })
  const found = checkAll(root)
  assert.ok(found.some((line) => line.includes('has a heading')))
  assert.ok(found.some((line) => line.includes('AI-disclosure line')))
  assert.ok(
    found.some((line) =>
      line.startsWith('notes-1.0.md: not a notes file name'),
    ),
  )
})

test('Play gets every wording plus the Canadian aliases; the Microsoft Store gets resolved text', () => {
  const root = folder(complete('android-', '1.2.3', 'Quicker snooze.'))
  const json = playJson('android', '1.2.3', root)
  assert.equal(json.versionName, '1.2.3')
  assert.deepEqual(json.locales['en-CA'], { copyFrom: 'en-US' })
  assert.deepEqual(json.locales['fr-CA'], { copyFrom: 'fr-FR' })
  assert.equal(Object.keys(json.locales).length, 9)

  const desktop = folder(complete('desktop-', '1.2.3', 'Quicker snooze.'))
  const texts = listingTexts('desktop', '1.2.3', desktop)
  assert.equal(texts['fr-CA'], texts['fr-FR'])
  assert.equal(Object.keys(texts).length, 9)
})

test("this repo's notes are complete and within every limit", () => {
  assert.deepEqual(checkAll(), [])
})

test('Play and the listing refuse a version without every wording, even on an English-only lane', () => {
  const root = folder({ '1.0.0.md': 'Faster sync.\n' })
  assert.throws(() => playJson('product', '1.0.0', root), /needs every wording/)
  assert.throws(
    () => listingTexts('product', '1.0.0', root),
    /needs every wording/,
  )
})
