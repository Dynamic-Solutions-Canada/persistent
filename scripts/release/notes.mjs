#!/usr/bin/env node
/**
 * Per-version release notes (REL-6, LIST-10): reads, checks and hands out the files in
 * `release-notes/`, the one source for every store's "What's new" and every GitHub Release.
 *
 * Path grammar: `release-notes/[<lane>-]<version>[.<identity>].md`. `<version>.md` is the
 * product (the deployed web service), and `android-`, `desktop-` and `linux-` are the lanes.
 * The plain file is the en-US text; a sibling per other wording catalog carries a translation.
 * en-CA and fr-CA reuse en-US and fr-FR, as the listings do.
 *
 * Bodies are user-facing text only: no heading and no AI-disclosure line, which the GitHub
 * step adds. Nothing here generates, falls back to or truncates notes.
 *
 * Length is counted in UTF-16 code units, which is how both stores' APIs measure a string: a
 * Chinese or Japanese character counts as one, never as its UTF-8 bytes.
 *
 * CLI (run from the repo root):
 *   node scripts/release/notes.mjs check                         every file, in validate
 *   node scripts/release/notes.mjs require <lane> <version>      the tagged version, in a release
 *   node scripts/release/notes.mjs play-json <lane> <version>    Play's localized notes JSON
 *   node scripts/release/notes.mjs text <lane> <version>         the en-US body, for GitHub
 * `<lane>` is `product`, `android`, `desktop` or `linux`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The wording catalogs the app ships, en-US first. */
export const IDENTITIES = [
  'en-US',
  'es-ES',
  'fr-FR',
  'de-DE',
  'zh-CN',
  'pt-BR',
  'ja-JP',
]

/** Listing locales that reuse another catalog's wording. */
export const ALIASES = { 'en-CA': 'en-US', 'fr-CA': 'fr-FR' }

/**
 * Per lane: where its text goes, so how long it may be, and whether every catalog is required.
 * The product lane and Linux publish only to GitHub; translations there are optional, but a
 * version that has any must have all of them.
 */
export const LANES = {
  product: { prefix: '', limit: 500, localized: false },
  android: { prefix: 'android-', limit: 500, localized: true },
  desktop: { prefix: 'desktop-', limit: 1500, localized: true },
  linux: { prefix: 'linux-', limit: 1500, localized: false },
}

const VERSION = /^\d+\.\d+\.\d+$/
const FILE =
  /^(?:(android|desktop|linux)-)?(\d+\.\d+\.\d+)(?:\.([a-z]{2}-[A-Z]{2}))?\.md$/

const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'release-notes',
)

/** A store's length for a string: UTF-16 code units, as their APIs count. */
export function storeLength(text) {
  return text.length
}

/** Read every notes file into lane → version → identity → text. Unknown names are errors. */
export function readAll(root = DEFAULT_ROOT) {
  const notes = {}
  const errors = []
  for (const name of readdirSync(root).sort()) {
    if (name === 'README.md') continue
    const match = FILE.exec(name)
    if (!match) {
      errors.push(
        `${name}: not a notes file name ([<lane>-]<version>[.<identity>].md)`,
      )
      continue
    }
    const [, laneName = 'product', version, identity = 'en-US'] = match
    if (!IDENTITIES.includes(identity)) {
      errors.push(`${name}: ${identity} is not one of the wording catalogs`)
      continue
    }
    const text = readFileSync(path.join(root, name), 'utf8').trim()
    ;((notes[laneName] ??= {})[version] ??= {})[identity] = text
  }
  return { notes, errors }
}

/** Problems with one lane version's set of files; an empty list means it is publishable. */
export function problems(laneName, version, texts) {
  const lane = LANES[laneName]
  const name = (identity) =>
    `${lane.prefix}${version}${identity === 'en-US' ? '' : `.${identity}`}.md`
  const found = []
  if (!texts?.['en-US']) found.push(`${name('en-US')} is missing`)
  const present = IDENTITIES.filter(
    (identity) => texts?.[identity] !== undefined,
  )
  const translated = present.filter((identity) => identity !== 'en-US')
  if (lane.localized || translated.length) {
    for (const identity of IDENTITIES.slice(1)) {
      if (texts?.[identity] === undefined)
        found.push(`${name(identity)} is missing`)
    }
  }
  for (const identity of present) {
    const text = texts[identity]
    if (!text) found.push(`${name(identity)} is empty`)
    else if (storeLength(text) > lane.limit) {
      found.push(
        `${name(identity)} is ${storeLength(text)} characters; the limit is ${lane.limit}`,
      )
    }
    if (/^#/m.test(text))
      found.push(`${name(identity)} has a heading; CI adds it`)
    if (/AI disclosure/i.test(text))
      found.push(`${name(identity)} has the AI-disclosure line; CI adds it`)
  }
  return found
}

/** Check every notes file in the folder. Returns the list of problems. */
export function checkAll(root = DEFAULT_ROOT) {
  const { notes, errors } = readAll(root)
  for (const [laneName, versions] of Object.entries(notes)) {
    for (const [version, texts] of Object.entries(versions)) {
      errors.push(...problems(laneName, version, texts))
    }
  }
  return errors
}

/** The texts for one lane version, refusing any problem. Throws with every problem listed. */
export function requireNotes(laneName, version, root = DEFAULT_ROOT) {
  if (!LANES[laneName])
    throw new Error(
      `Unknown lane ${laneName}; use ${Object.keys(LANES).join(', ')}.`,
    )
  if (!VERSION.test(version))
    throw new Error(`${version} is not a three-part version.`)
  const { notes } = readAll(root)
  const texts = notes[laneName]?.[version]
  const found = problems(laneName, version, texts)
  if (found.length) {
    throw new Error(
      `Release notes for ${laneName} ${version} are not ready:\n- ${found.join('\n- ')}`,
    )
  }
  return texts
}

/** Play's localized notes document (play-metadata.mjs), with the Canadian aliases. */
export function playJson(laneName, version, root = DEFAULT_ROOT) {
  const texts = requireNotes(laneName, version, root)
  // Play shows every listing locale, so it needs every wording, whatever the lane requires.
  const missing = IDENTITIES.filter((identity) => !texts[identity])
  if (missing.length) {
    throw new Error(
      `Play needs every wording; ${laneName} ${version} has none for ${missing.join(', ')}.`,
    )
  }
  const locales = Object.fromEntries(
    IDENTITIES.map((identity) => [identity, { text: texts[identity] }]),
  )
  for (const [alias, source] of Object.entries(ALIASES))
    locales[alias] = { copyFrom: source }
  return { schemaVersion: 1, versionName: version, locales }
}

/** The text for every listing locale, aliases resolved, for the Microsoft Store. */
export function listingTexts(laneName, version, root = DEFAULT_ROOT) {
  const texts = requireNotes(laneName, version, root)
  const missing = IDENTITIES.filter((identity) => !texts[identity])
  if (missing.length) {
    throw new Error(
      `The listing needs every wording; ${laneName} ${version} has none for ${missing.join(', ')}.`,
    )
  }
  const byLocale = { ...texts }
  for (const [alias, source] of Object.entries(ALIASES))
    byLocale[alias] = texts[source]
  return byLocale
}

/** Command-line entry; see the header. */
function main(argv) {
  const [command, laneName, version] = argv
  if (command === 'check') {
    const found = checkAll()
    if (found.length) {
      console.error(`Release notes problems:\n- ${found.join('\n- ')}`)
      return 1
    }
    console.log('Release notes are complete and within each store limit.')
    return 0
  }
  if (command === 'require') {
    requireNotes(laneName, version)
    console.log(`Release notes for ${laneName} ${version} are ready.`)
    return 0
  }
  if (command === 'play-json') {
    process.stdout.write(
      `${JSON.stringify(playJson(laneName, version), null, 2)}\n`,
    )
    return 0
  }
  if (command === 'text') {
    process.stdout.write(`${requireNotes(laneName, version)['en-US']}\n`)
    return 0
  }
  console.error(
    'Usage: notes.mjs check | require|play-json|text <lane> <version>',
  )
  return 2
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
