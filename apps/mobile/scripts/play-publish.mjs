#!/usr/bin/env node
/**
 * Publish one AAB to one or more Google Play tracks, and pre-flight the things
 * that otherwise only fail after a full CI build.
 *
 * Releases target production only. Uploads and promotion of an existing build
 * use one Play edit so production publication and retirement of phone testing
 * releases commit together. Play rejects a second upload of a known versionCode.
 *
 * Auth is a Play Developer service account: PLAY_SERVICE_ACCOUNT_JSON holds the
 * key file's contents verbatim (not base64), matching the GitHub secret. No
 * dependencies: Node 24 has fetch and RS256 signing built in.
 *
 * Modes:
 *   --listing-json <json> Validate and push all nine localized titles/descriptions
 *                   in one edit. --check compares and discards the edit. Text
 *                   only unless --images is given; never changes app details or
 *                   countries.
 *   --images        With --listing-json: in the same edit, replace every listed
 *                   language's phone screenshots with the manifest's `play` files,
 *                   in manifest order (--manifest <json> to point elsewhere). The
 *                   files are validated before OAuth, also under --check, which
 *                   reports the planned replacement and writes nothing. The icon
 *                   and feature graphic are never touched.
 *   --localized-notes <json> Version-bound nine-locale notes for upload or
 *                   --set-notes. Requires matching --version-name; cannot be
 *                   combined with --notes. Over-limit notes fail before OAuth.
 *   --check         Report each track's releases and the highest versionCode in
 *                   use, then exit. With --version-code, exits non-zero when
 *                   that code is not strictly higher than everything on Play —
 *                   the one Play failure worth catching *before* a 4-minute
 *                   build, since the code is baked in at assemble time.
 *   --listing [json] Push the English store listing: the descriptions from the
 *                   en-US record of store-assets/play/listings.json and the phone
 *                   screenshots from store-assets/play (--no-screenshots for copy only,
 *                   --screenshots <dir> to point elsewhere). Add --check to diff
 *                   against what Play currently serves and write nothing.
 *                   Deliberately not part of a release: the copy changes on its
 *                   own schedule, so it rides a manual workflow_dispatch
 *                   (.github/workflows/play-listing.yml) instead.
 *   --promote       Move a versionCode that is already on Play onto one more
 *                   track, with no upload and no build. Needs --version-code and
 *                   a single --tracks destination; --from picks which track's
 *                   release name and notes to carry forward when the build sits
 *                   on several. --rollout <0..1> starts a staged rollout instead
 *                   of releasing to everyone at once.
 *   --testers       Report the Google Groups that can test each --tracks track,
 *                   or set them with --groups a@x.com,b@y.com. Combine with
 *                   --package to read another app's groups, which is how a second
 *                   app reuses an existing tester list. Play's API knows only about
 *                   groups: a track whose testers were added as individual email
 *                   addresses reports none, and those stay Console-only.
 *   --set-notes     Rewrite the "what's new" of a versionCode already on Play,
 *                   on every --tracks track, changing nothing else about the
 *                   release. Needs --version-code, --tracks and --notes <file>.
 *                   For when the generated notes turn out to be wrong after they
 *                   are already public.
 *   --production-only Require production as the sole destination and clear active
 *                   phone testing releases in the same edit. Use with upload or
 *                   --promote; other form-factor tracks are left unchanged.
 *   (default)       Upload --aab and release it to --tracks.
 *
 * Usage:
 *   node scripts/play-publish.mjs --check --version-code 40
 *   node scripts/play-publish.mjs --listing-json ../../store-assets/play/listings.json [--images] [--check]
 *   node scripts/play-publish.mjs --listing [--check] [--no-screenshots]
 *   node scripts/play-publish.mjs --aab app.aab --tracks production --production-only \
 *     --version-name 0.17.0 --notes RELEASE_NOTES.md [--status completed|draft]
 *   node scripts/play-publish.mjs --promote --version-code 45 --tracks production \
 *     [--production-only] [--rollout 0.2]
 *   node scripts/play-publish.mjs --set-notes --version-code 46 \
 *     --tracks production --notes RELEASE_NOTES.md
 */
import { readFileSync, readdirSync } from 'node:fs'
import {
  getPlayAccessToken as getAccessToken,
  playRequest as request,
  readPlayServiceAccount,
} from './play-api.mjs'
import { retirePhoneTestingTracks } from './play-tracks.mjs'
import { PlayMetadata } from './play-metadata.mjs'
import { PlayImages } from './play-images.mjs'

// PLAY_API_BASE is a test seam: play-publish.test.ts points it at a local mock
// to assert the request sequence (one edit, one upload, every track). Never set
// it in CI.
const API =
  process.env.PLAY_API_BASE || 'https://androidpublisher.googleapis.com'
const DEFAULT_PACKAGE = 'ca.dynamicsolutions.persistent'

/** Play hard-caps a release note at 500 characters and rejects an empty one. */
const NOTE_LIMIT = 500
const NOTE_FALLBACK = 'Bug fixes and improvements.'
const NOTE_LANGUAGE = 'en-US'

/** Where the listing copy lives, relative to apps/mobile (this script's cwd in CI). */
const DEFAULT_LISTING = '../../store-assets/play/listings.json'
const LISTING_LANGUAGE = 'en-US'

/**
 * Play's caps on the fields this script writes. Enforced here rather than left
 * to the API because the listing markdown used to carry a hand-written character
 * count that was wrong by 1,500 — the description sat over the limit for months
 * with nothing to catch it. This is now the count that matters.
 */
export const LISTING_LIMITS = { shortDescription: 80, fullDescription: 4000 }

/** Where the phone screenshots live, relative to apps/mobile. */
const DEFAULT_SCREENSHOTS = '../../store-assets/play'
/** Where the approved Play screenshots are listed, relative to apps/mobile. */
const DEFAULT_MANIFEST = '../../store-assets/manifest.json'

// The screenshot rules and PNG helpers moved to play-images.mjs so play-metadata.mjs can
// share them without an import cycle. Re-exported for existing callers and tests.
export const SCREENSHOT_RULES = PlayImages.rules
export const pngSize = PlayImages.pngSize
export const pngHasAlpha = PlayImages.pngHasAlpha
export const screenshotProblems = PlayImages.screenshotProblems

function fail(message) {
  console.error(`\n[play-publish] ${message}\n`)
  process.exit(1)
}

function read(path, what, encoding) {
  try {
    return readFileSync(path, encoding)
  } catch (error) {
    return fail(
      `Could not read the ${what} at ${path}: ${error?.message || error}`,
    )
  }
}

// --- pure helpers (unit-tested in play-publish.test.ts) ----------------------

/** Minimal `--flag value` / `--flag` parser. Returns a plain object of strings/true. */
export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

/**
 * `"internal, alpha"` -> `['internal', 'alpha']`, deduped, order preserved.
 *
 * Named for the shape rather than for tracks: tester Google Groups arrive the same
 * way, and a second copy of four lines of trimming would be the sort of thing that
 * drifts on one side only.
 */
export function parseList(value) {
  const items = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return [...new Set(items)]
}

/**
 * Turn the GitHub release notes into Play's "what's new" text.
 *
 * The same notes feed the in-app update prompt, where the markdown heading and
 * the compare link are useful; on Play they are noise inside a 500-character
 * budget. Truncation is on a line boundary so a release never ships a note that
 * stops mid-sentence.
 */
export function playNotesFrom(markdown, limit = NOTE_LIMIT) {
  const lines = String(markdown ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .filter((line) => !line.startsWith('**Full changelog**'))
    .map((line) => line.trimEnd())

  // Drop leading/trailing blank lines left behind by the filters.
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()

  const kept = []
  let length = 0
  for (const line of lines) {
    const cost = length === 0 ? line.length : line.length + 1
    if (length + cost > limit) break
    kept.push(line)
    length += cost
  }

  if (kept.length) return kept.join('\n')
  // A single opening line longer than the whole budget: keep as much as fits
  // rather than discarding real notes for the generic fallback.
  const first = lines[0]?.trim()
  if (first) return `${first.slice(0, limit - 1)}…`
  return NOTE_FALLBACK
}

/**
 * The English store copy from the Play listings.json (LIST-3). Throws rather than returning a
 * partial listing: a missing field would push an empty value, and Play takes that as "clear this
 * field" rather than "leave it alone".
 */
export function listingFromJson(source) {
  const english = source?.locales?.[LISTING_LANGUAGE]
  const missing = ['shortDescription', 'fullDescription'].filter(
    (field) => typeof english?.[field] !== 'string' || !english[field].trim(),
  )
  if (missing.length) {
    throw new Error(
      `The ${LISTING_LANGUAGE} record has no ${missing.join(' or ')}.`,
    )
  }
  return {
    shortDescription: english.shortDescription.trim(),
    fullDescription: english.fullDescription.trim(),
  }
}

/** Play's character count, per field. Empty is a problem too — see above. */
export function listingProblems(listing) {
  const problems = []
  for (const [field, limit] of Object.entries(LISTING_LIMITS)) {
    // Spread, not .length: counts characters the way a person does, so an em
    // dash or a bullet costs one rather than a surrogate pair's two.
    const size = [...(listing?.[field] ?? '')].length
    if (size === 0)
      problems.push(`${field} is empty — Play would clear the live text.`)
    else if (size > limit)
      problems.push(`${field} is ${size} characters; Play's limit is ${limit}.`)
  }
  return problems
}

/** Per-field "unchanged / CHANGED" summary, so a push says what it is about to do. */
export function describeListingDiff(current, next) {
  return Object.keys(LISTING_LIMITS)
    .map((field) => {
      const before = current?.[field] ?? ''
      const after = next?.[field] ?? ''
      const size = `${[...after].length}/${LISTING_LIMITS[field]}`
      if (before === after) return `  ${field}: unchanged (${size} chars)`
      return `  ${field}: CHANGED (${[...before].length} -> ${size} chars)`
    })
    .join('\n')
}

/** Highest versionCode across every release of every track, or 0 if none. */
export function highestVersionCode(tracks) {
  let highest = 0
  for (const track of tracks ?? []) {
    for (const release of track.releases ?? []) {
      for (const code of release.versionCodes ?? []) {
        const value = Number(code)
        if (Number.isFinite(value) && value > highest) highest = value
      }
    }
  }
  return highest
}

/**
 * [release] with its "what's new" replaced, and everything else left alone.
 *
 * Play has no way to edit release notes on their own: the only write is a PUT
 * that replaces the track's whole release. So every other field has to be carried
 * across by hand, and the ones that matter are easy to drop. `status` and
 * `userFraction` in particular describe a rollout in progress, and rebuilding a
 * release without them would quietly finish a staged rollout that was deliberately
 * held at a fraction of users.
 */
export function withReleaseNotes(release, text, language = NOTE_LANGUAGE) {
  const next = { ...release, releaseNotes: [{ language, text }] }
  if (next.userFraction === undefined) delete next.userFraction
  return next
}

/**
 * What Play's unhelpfully generic track-write refusal probably means, or null.
 *
 * Writing a release to a track the app is not yet eligible for answers
 * `FAILED_PRECONDITION` with the message "Precondition check failed." and nothing
 * else: no field, no reason, no link. It is the same answer for every unmet
 * requirement, and it is the first thing anyone promoting to production for the
 * first time will hit, so the checklist belongs here rather than in someone's
 * memory.
 */
export function trackPreconditionHelp(track, status) {
  if (status !== 'FAILED_PRECONDITION') return null
  return (
    `Play refused to put a release on '${track}' and gave no reason beyond "precondition failed".\n` +
    'That single error covers every way an app can be ineligible for a track. For a first\n' +
    `release to '${track}', check in the Play Console, in this order:\n` +
    '  1. Closed testing requirement. A personal (non-organization) developer account has to\n' +
    '     run a closed test with at least 12 testers opted in for 14 continuous days before\n' +
    '     production unlocks. This is the usual answer, it cannot be waived, and no API call\n' +
    '     will succeed until it is satisfied.\n' +
    '  2. App content declarations: privacy policy, data safety, content rating, target\n' +
    '     audience, ads, and any of the "is your app a ..." questions. All must be complete,\n' +
    '     not merely started.\n' +
    '  3. Store listing and the countries/regions the release goes to.\n' +
    'Nothing was written: the edit was never committed, so the track is untouched.'
  )
}

/**
 * The release carrying [versionCode], and the track it was found on.
 *
 * A promotion copies a build that is already on Play onto another track, so the
 * name and "what's new" have to come from somewhere: taking them from the source
 * release is what makes production show testers' notes rather than a placeholder,
 * and it is why this returns the whole release rather than just a boolean.
 *
 * `preferred` is searched first so a build sitting on several tracks resolves to
 * the one being promoted from, which is the one whose notes are current.
 */
export function findRelease(tracks, versionCode, preferred) {
  const wanted = String(versionCode)
  const order = [...(tracks ?? [])].sort((a, b) => {
    if (a.track === preferred) return -1
    if (b.track === preferred) return 1
    return 0
  })
  for (const track of order) {
    for (const release of track.releases ?? []) {
      if ((release.versionCodes ?? []).map(String).includes(wanted)) {
        return { track: track.track, release }
      }
    }
  }
  return null
}

/**
 * Why [versionCode] must not go onto [target], or null when it may.
 *
 * Play accepts a promotion that moves a track *backwards*, which would hand
 * production an older build than it already serves and, with no error to notice,
 * quietly un-ship whatever was there. Refusing here is the only guard, since a
 * promotion has no build step to catch it the way an upload's versionCode check
 * does.
 */
export function promotionBlocker(tracks, versionCode, target) {
  const existing = (tracks ?? []).find((track) => track.track === target)
  if (!existing) return null
  const highest = highestVersionCode([existing])
  if (highest && Number(versionCode) < highest) {
    return `${target} already serves versionCode ${highest}; promoting ${versionCode} would move it backwards.`
  }
  return null
}

/** One `track: versionCodes (status)` line per release, for the CI log. */
export function describeTracks(tracks) {
  if (!tracks?.length) return '  (no tracks have releases yet)'
  return tracks
    .map((track) => {
      const releases = (track.releases ?? []).map(
        (r) =>
          `${(r.versionCodes ?? ['-']).join(', ')} (${r.status ?? 'unknown'})`,
      )
      return `  ${track.track}: ${releases.length ? releases.join(' | ') : '(empty)'}`
    })
    .join('\n')
}

// --- Play API ---------------------------------------------------------------

/**
 * Play API request. `raw` sends a Buffer as octet-stream (bundle upload);
 * otherwise the body is JSON. Returns the parsed response, or the error text
 * when `tolerate` matches so the caller can react to a specific failure.
 */
async function playFetch(
  token,
  path,
  { method = 'GET', body, raw, rawType, tolerate, bestEffort } = {},
) {
  const headers = { Authorization: `Bearer ${token}` }
  let payload
  if (raw) {
    // Content-Length is left to undici — it derives it from the buffer, and
    // setting it here risks a duplicate/conflicting header.
    headers['Content-Type'] = rawType ?? 'application/octet-stream'
    payload = raw
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const response = await request(
    `${API}${path}`,
    { method, headers, body: payload },
    'the Play Developer API',
  )
  const text = await response.text()
  if (!response.ok) {
    if (tolerate && text.includes(tolerate)) return { error: text }
    // Cleanup calls on a failure path: the real error is the one already being
    // reported, and dying inside the tidy-up would hide it.
    if (bestEffort) return { error: text }
    fail(`${method} ${path} failed (HTTP ${response.status}): ${text}`)
  }
  return text ? JSON.parse(text) : {}
}

const editsPath = (pkg, editId = '') =>
  `/androidpublisher/v3/applications/${pkg}/edits${editId ? `/${editId}` : ''}`

/** Clear active phone testing releases, logging each update before the caller commits. */
async function retireTestingTracks(token, packageName, editId, current) {
  await retirePhoneTestingTracks(current, async (body) => {
    await playFetch(
      token,
      `${editsPath(packageName, editId)}/tracks/${encodeURIComponent(body.track)}`,
      {
        method: 'PUT',
        body,
      },
    )
    console.log(`[play-publish] track ${body.track} <- no active releases`)
  })
}

/**
 * Commit an edit, retrying without review submission if Play insists.
 *
 * Play refuses to auto-submit for review while the app already has changes
 * pending review. The edit itself is still valid; it just has to be committed
 * without the submission, and the change waits for the next review round.
 */
async function commitEdit(token, packageName, editId) {
  const path = `${editsPath(packageName, editId)}:commit`
  const committed = await playFetch(token, path, {
    method: 'POST',
    tolerate: 'changesNotSentForReview',
  })
  if (committed.error) {
    console.log(
      '[play-publish] Play declined to auto-submit for review; committing with changesNotSentForReview=true',
    )
    await playFetch(token, `${path}?changesNotSentForReview=true`, {
      method: 'POST',
    })
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const packageName = args['package'] || DEFAULT_PACKAGE

  // Validate the invocation before authenticating: a missing flag should fail
  // instantly and unmistakably, not after a token round-trip.
  const localizedListingMode = Boolean(args['listing-json'])
  const listingMode = Boolean(args.listing) || localizedListingMode
  const promoteMode = Boolean(args.promote)
  const setNotesMode = Boolean(args['set-notes'])
  const testersMode = Boolean(args.testers)
  const publishing =
    !args.check && !listingMode && !promoteMode && !setNotesMode && !testersMode
  const aab = args.aab
  const tracks = parseList(args.tracks)
  const versionName = args['version-name']
  const status = args.status || 'completed'
  const rollout = args.rollout === undefined ? null : Number(args.rollout)
  const productionOnly = Boolean(args['production-only'])
  if (productionOnly && !publishing && !promoteMode) {
    fail('--production-only needs an upload or --promote.')
  }
  if (productionOnly && (tracks.length !== 1 || tracks[0] !== 'production')) {
    fail(
      '--production-only requires --tracks production as the sole destination.',
    )
  }
  if (testersMode && !tracks.length) {
    fail(
      '--testers needs --tracks <alpha[,beta,...]>: testers are per closed/open track.',
    )
  }
  if (setNotesMode) {
    if (!Number.isFinite(Number(args['version-code']))) {
      fail(
        '--set-notes needs --version-code <n>: the release already on Play to rewrite.',
      )
    }
    if (!tracks.length)
      fail('--set-notes needs --tracks <internal[,alpha,...]>.')
    if (!args.notes && !args['localized-notes'])
      fail('--set-notes needs --notes or --localized-notes <file>.')
  }
  if (promoteMode) {
    if (!Number.isFinite(Number(args['version-code']))) {
      fail(
        '--promote needs --version-code <n>: the build already on Play to move.',
      )
    }
    if (tracks.length !== 1) {
      fail('--promote takes exactly one --tracks value, the destination.')
    }
    if (rollout !== null && !(rollout > 0 && rollout < 1)) {
      fail(
        `--rollout must be between 0 and 1 exclusive, got '${args.rollout}'.`,
      )
    }
  }
  if (publishing) {
    if (!aab) fail('--aab <path> is required.')
    if (!tracks.length) fail('--tracks <internal[,alpha,...]> is required.')
    if (!versionName) fail('--version-name <x.y.z> is required.')
    if (!['completed', 'draft'].includes(status)) {
      fail(`--status must be 'completed' or 'draft', got '${status}'.`)
    }
  }
  if (args.listing && localizedListingMode)
    fail('Choose --listing or --listing-json, not both.')
  if (localizedListingMode && args.screenshots)
    fail(
      '--listing-json takes its screenshots from the manifest with --images; --screenshots is for --listing.',
    )
  if (args.images && !localizedListingMode)
    fail('--images needs --listing-json: it rides the localized text edit.')
  if (args.notes && args['localized-notes'])
    fail('Choose --notes or --localized-notes, not both.')
  // Read the AAB and notes up front too — a bad path is a caller error, and
  // finding it now avoids leaving an uncommitted edit behind on Play.
  const notes =
    (publishing || setNotesMode) && args.notes
      ? playNotesFrom(read(args.notes, 'notes', 'utf8'))
      : NOTE_FALLBACK
  const bundle = publishing ? read(aab, 'AAB') : null
  const localizedNotes = args['localized-notes']
    ? PlayMetadata.notes(
        JSON.parse(
          read(args['localized-notes'], 'localized release notes', 'utf8'),
        ),
        versionName,
      )
    : null
  const notesLog = localizedNotes
    ? localizedNotes
        .map(({ language, text }) => `${language}: ${text}`)
        .join('\n')
    : notes
  const localizedListings = localizedListingMode
    ? PlayMetadata.listings(
        JSON.parse(read(args['listing-json'], 'localized listings', 'utf8')),
      )
    : null
  // Read and check every screenshot before OAuth, also for --check, so a bad image fails
  // the dry run instead of a publish part-way through its edit.
  let imagePlan = null
  if (localizedListingMode && args.images) {
    const manifestPath =
      typeof args.manifest === 'string' ? args.manifest : DEFAULT_MANIFEST
    try {
      imagePlan = PlayImages.plan(
        PlayMetadata.languages,
        PlayImages.loadScreenshots(manifestPath),
      )
    } catch (error) {
      fail(error?.message || String(error))
    }
  }

  // Same reasoning for the listing: parse and length-check the copy before
  // authenticating, so a malformed file never opens an edit on Play.
  const listingFile =
    typeof args.listing === 'string' ? args.listing : DEFAULT_LISTING
  const shotsDir =
    typeof args.screenshots === 'string'
      ? args.screenshots
      : DEFAULT_SCREENSHOTS
  // `--no-screenshots` pushes copy alone, for a wording fix that shouldn't
  // re-upload six images (each upload is a fresh asset on Play's side).
  const withShots =
    listingMode && !localizedListingMode && !args['no-screenshots']
  let listing = null
  let shots = []
  if (listingMode && !localizedListingMode) {
    try {
      listing = listingFromJson(
        JSON.parse(read(listingFile, 'listings.json', 'utf8')),
      )
    } catch (error) {
      fail(`${listingFile}: ${error.message}`)
    }
    const problems = listingProblems(listing)
    if (problems.length)
      fail(`${listingFile} is not publishable:\n  - ${problems.join('\n  - ')}`)
  }
  if (withShots) {
    // Sorted by filename: Play shows screenshots in upload order, and the names
    // are numbered precisely so that order is the one the listing intends.
    let names
    try {
      names = readdirSync(shotsDir)
        .filter((name) => name.toLowerCase().endsWith('.png'))
        .sort()
    } catch (error) {
      return fail(
        `Could not read the screenshots directory at ${shotsDir}: ${error?.message || error}`,
      )
    }
    shots = names.map((name) => ({
      name,
      bytes: read(`${shotsDir}/${name}`, `screenshot ${name}`),
    }))
    const problems = screenshotProblems(shots)
    if (problems.length)
      fail(`${shotsDir} is not publishable:\n  - ${problems.join('\n  - ')}`)
  }

  const serviceAccount = readPlayServiceAccount(
    process.env.PLAY_SERVICE_ACCOUNT_JSON,
  )

  const token = await getAccessToken(serviceAccount)
  console.log(`[play-publish] authenticated as ${serviceAccount.client_email}`)
  console.log(`[play-publish] package ${packageName}`)

  if (localizedListings) {
    await PlayMetadata.publishListings({
      listings: localizedListings,
      request: (path, options) => playFetch(token, path, options),
      commit: (id) => commitEdit(token, packageName, id),
      editPath: editsPath(packageName),
      check: Boolean(args.check),
      images: imagePlan,
    })
    return
  }

  // --- --listing: push the English store copy and screenshots -----------------
  if (listingMode) {
    const edit = await playFetch(token, editsPath(packageName), {
      method: 'POST',
      body: {},
    })
    const path = `${editsPath(packageName, edit.id)}/listings/${LISTING_LANGUAGE}`
    const current = await playFetch(token, path)

    console.log(
      `[play-publish] ${LISTING_LANGUAGE} listing — Play vs ${listingFile}:`,
    )
    console.log(describeListingDiff(current, listing))

    const imagesPath = `${editsPath(packageName, edit.id)}/listings/${LISTING_LANGUAGE}/${PlayImages.type}`
    if (withShots) {
      const live = await playFetch(token, imagesPath)
      const liveCount = live.images?.length ?? 0
      console.log(
        `  ${PlayImages.type}: ${liveCount} on Play -> ${shots.length} from ${shotsDir}`,
      )
      for (const shot of shots) {
        const { width, height } = pngSize(shot.bytes)
        console.log(`    ${shot.name} (${width}x${height})`)
      }
    }

    if (args.check) {
      // Read-only probe: drop the edit so it can't linger and block later ones.
      await playFetch(token, editsPath(packageName, edit.id), {
        method: 'DELETE',
      })
      console.log('[play-publish] --check: nothing written, edit discarded')
      return
    }

    // PATCH, not PUT. The same resource carries the app title, the promo video
    // URL and the localized graphics, and a PUT omitting them clears them. Only
    // the two description fields are this script's to write.
    await playFetch(token, path, {
      method: 'PATCH',
      body: {
        language: LISTING_LANGUAGE,
        shortDescription: listing.shortDescription,
        fullDescription: listing.fullDescription,
      },
    })
    // Replace the whole set rather than diffing: Play has no stable identity for
    // "the third screenshot", so there is nothing to match a local file against.
    // Both the delete and the uploads live inside this edit, so a failure part-way
    // leaves the live listing untouched — the edit simply never commits.
    if (withShots) {
      await playFetch(token, imagesPath, { method: 'DELETE' })
      for (const shot of shots) {
        await playFetch(token, `/upload${imagesPath}?uploadType=media`, {
          method: 'POST',
          raw: shot.bytes,
          rawType: PlayImages.imageInfo(shot.bytes).contentType,
        })
        console.log(`[play-publish] uploaded ${shot.name}`)
      }
    }

    await commitEdit(token, packageName, edit.id)
    console.log(
      `[play-publish] committed. ${LISTING_LANGUAGE} listing updated from ${listingFile}`,
    )
    if (withShots)
      console.log(
        `[play-publish] ${shots.length} screenshots replaced from ${shotsDir}`,
      )
    console.log(
      '[play-publish] Upload committed. Verify Publishing overview in Play Console: API success does not prove the changes were sent for review or published.',
    )
    return
  }

  // --- --testers: read or set a track's Google Groups -----------------------
  //
  // Reusing an existing app's tester list is the point: Play's closed-testing
  // requirement counts testers per app, and re-recruiting the same people by hand
  // for a second app is both slow and easy to get wrong by one address.
  if (testersMode) {
    const groups = args.groups === undefined ? null : parseList(args.groups)
    const edit = await playFetch(token, editsPath(packageName), {
      method: 'POST',
      body: {},
    })

    for (const track of tracks) {
      const path = `${editsPath(packageName, edit.id)}/testers/${track}`
      if (groups === null) {
        const current = await playFetch(token, path)
        const found = current.googleGroups ?? []
        console.log(
          `[play-publish] ${packageName} ${track}: ${found.length ? found.join(', ') : '(no Google Groups)'}`,
        )
      } else {
        await playFetch(token, path, {
          method: 'PUT',
          body: { googleGroups: groups },
        })
        console.log(
          `[play-publish] ${packageName} ${track} <- ${groups.join(', ')}`,
        )
      }
    }

    if (groups === null) {
      // A read must not commit: it would publish an empty edit, and the point of
      // reading is to change nothing.
      await playFetch(token, editsPath(packageName, edit.id), {
        method: 'DELETE',
        bestEffort: true,
      })
      console.log('[play-publish] read only, nothing written.')
      console.log(
        "[play-publish] Individually-listed tester emails are invisible here; Play's API knows only groups.",
      )
      return
    }
    await commitEdit(token, packageName, edit.id)
    console.log(`[play-publish] committed. testers set on ${tracks.join(', ')}`)
    return
  }

  // --- --set-notes: rewrite an existing release's "what's new" --------------
  //
  // The notes are generated from commit subjects, so a bad filter ships prose no
  // user can act on, and the mistake is only visible after it is public. Fixing it
  // by hand in the Console leaves no record of what changed or why; this does the
  // same edit from the same generated file the release used.
  if (setNotesMode) {
    const versionCode = Number(args['version-code'])
    const edit = await playFetch(token, editsPath(packageName), {
      method: 'POST',
      body: {},
    })
    const { tracks: current } = await playFetch(
      token,
      `${editsPath(packageName, edit.id)}/tracks`,
    )

    // Resolve every track before writing any: a partial rewrite would leave the
    // tracks disagreeing about what the same build changed.
    const targets = []
    for (const track of tracks) {
      const found = findRelease(current, versionCode, track)
      if (!found || found.track !== track) {
        await playFetch(token, editsPath(packageName, edit.id), {
          method: 'DELETE',
          bestEffort: true,
        })
        fail(
          `versionCode ${versionCode} is not on '${track}', so it has no notes there to rewrite.`,
        )
      }
      targets.push({ track, release: found.release })
    }

    for (const { track, release } of targets) {
      await playFetch(
        token,
        `${editsPath(packageName, edit.id)}/tracks/${track}`,
        {
          method: 'PUT',
          body: {
            track,
            releases: [
              {
                ...withReleaseNotes(release, notes),
                ...(localizedNotes ? { releaseNotes: localizedNotes } : {}),
              },
            ],
          },
        },
      )
      console.log(
        `[play-publish] track ${track} <- new notes for versionCode ${versionCode}`,
      )
    }
    await commitEdit(token, packageName, edit.id)
    console.log(
      `[play-publish] committed. notes rewritten on ${tracks.join(', ')}`,
    )
    console.log("--- what's new ---")
    console.log(notesLog)
    return
  }

  // --- --promote: move a build already on Play onto another track -----------
  //
  // No upload: the AAB exists on Play already, and re-uploading it is impossible
  // anyway (Play rejects a versionCode it has seen). The whole operation is
  // "read the release, write it to another track", inside one edit so a failure
  // part-way leaves the destination untouched.
  if (promoteMode) {
    const target = tracks[0]
    const versionCode = Number(args['version-code'])
    const edit = await playFetch(token, editsPath(packageName), {
      method: 'POST',
      body: {},
    })
    const { tracks: current } = await playFetch(
      token,
      `${editsPath(packageName, edit.id)}/tracks`,
    )
    console.log('[play-publish] current Play tracks:')
    console.log(describeTracks(current))

    const found = findRelease(current, versionCode, args.from)
    if (!found) {
      await playFetch(token, editsPath(packageName, edit.id), {
        method: 'DELETE',
      })
      fail(
        `versionCode ${versionCode} is not on any track, so there is nothing to promote.\n` +
          'Upload the build through the release workflow first.',
      )
    }
    const blocker = promotionBlocker(current, versionCode, target)
    if (blocker) {
      await playFetch(token, editsPath(packageName, edit.id), {
        method: 'DELETE',
      })
      fail(blocker)
    }

    // Carry the source release's name and notes forward: promoting is the same
    // build reaching more people, so it should say the same thing to them.
    const source = found.release
    const release = {
      name: versionName || source.name,
      versionCodes: [String(versionCode)],
      status: rollout === null ? 'completed' : 'inProgress',
    }
    if (rollout !== null) release.userFraction = rollout
    if (source.releaseNotes?.length) release.releaseNotes = source.releaseNotes

    // `tolerate` rather than a bare call: Play answers an ineligible track with a
    // bare "Precondition check failed", and passing that through verbatim is the
    // difference between a two-minute answer and an afternoon.
    const written = await playFetch(
      token,
      `${editsPath(packageName, edit.id)}/tracks/${target}`,
      {
        method: 'PUT',
        body: { track: target, releases: [release] },
        tolerate: 'FAILED_PRECONDITION',
      },
    )
    if (written?.error) {
      await playFetch(token, editsPath(packageName, edit.id), {
        method: 'DELETE',
        bestEffort: true,
      })
      fail(trackPreconditionHelp(target, 'FAILED_PRECONDITION'))
    }
    if (productionOnly)
      await retireTestingTracks(token, packageName, edit.id, current)
    await commitEdit(token, packageName, edit.id)

    const reach =
      rollout === null ? 'all users' : `${(rollout * 100).toFixed(0)}% of users`
    console.log(
      `[play-publish] committed. versionCode ${versionCode} promoted from ${found.track} ` +
        `to ${target} (${release.name}) for ${reach}`,
    )
    if (!source.releaseNotes?.length) {
      console.log(
        '[play-publish] the source release carried no notes, so none were set.',
      )
    }
    return
  }

  // --- --check: report state, verify the versionCode can still be used ------
  if (args.check) {
    const edit = await playFetch(token, editsPath(packageName), {
      method: 'POST',
      body: {},
    })
    const { tracks } = await playFetch(
      token,
      `${editsPath(packageName, edit.id)}/tracks`,
    )
    console.log('[play-publish] current Play tracks:')
    console.log(describeTracks(tracks))
    const highest = highestVersionCode(tracks)
    console.log(
      `[play-publish] highest versionCode on Play: ${highest || '(none)'}`,
    )
    // Read-only probe: drop the edit so it can't linger and block later edits.
    await playFetch(token, editsPath(packageName, edit.id), {
      method: 'DELETE',
    })

    const intended = Number(args['version-code'])
    if (Number.isFinite(intended) && intended > 0) {
      console.log(
        `[play-publish] this build would upload versionCode ${intended}`,
      )
      if (intended <= highest) {
        fail(
          `versionCode ${intended} is not higher than ${highest}, which Play already has.\n` +
            'Play requires a strictly increasing, never-reused code, so this build would be\n' +
            'rejected after the Android build finishes.\n\n' +
            `Fix: set the repo variable PLAY_VERSION_CODE_OFFSET to at least ${highest - intended + 1}\n` +
            '(gh variable set PLAY_VERSION_CODE_OFFSET --body "<n>"). It is added to the workflow\n' +
            'run number, so every later run stays above Play as well.',
        )
      }
    }
    return
  }

  // --- publish -------------------------------------------------------------
  const edit = await playFetch(token, editsPath(packageName), {
    method: 'POST',
    body: {},
  })
  console.log(`[play-publish] edit ${edit.id} created`)

  const uploaded = await playFetch(
    token,
    `/upload${editsPath(packageName, edit.id)}/bundles?uploadType=media`,
    { method: 'POST', raw: bundle },
  )
  const versionCode = uploaded.versionCode
  console.log(
    `[play-publish] uploaded ${aab} (${(bundle.length / 1e6).toFixed(1)} MB) as versionCode ${versionCode}`,
  )

  // All release changes stay inside this edit until every track update succeeds.
  for (const track of tracks) {
    await playFetch(
      token,
      `${editsPath(packageName, edit.id)}/tracks/${track}`,
      {
        method: 'PUT',
        body: {
          track,
          releases: [
            {
              name: versionName,
              versionCodes: [String(versionCode)],
              status,
              releaseNotes: localizedNotes ?? [
                { language: NOTE_LANGUAGE, text: notes },
              ],
            },
          ],
        },
      },
    )
    console.log(
      `[play-publish] track ${track} <- versionCode ${versionCode} (${status})`,
    )
  }

  if (productionOnly) {
    const { tracks: current } = await playFetch(
      token,
      `${editsPath(packageName, edit.id)}/tracks`,
    )
    await retireTestingTracks(token, packageName, edit.id, current)
  }
  await commitEdit(token, packageName, edit.id)

  console.log(
    `[play-publish] committed. ${versionName} (versionCode ${versionCode}) -> ${tracks.join(', ')}`,
  )
  console.log("--- what's new ---")
  console.log(notesLog)
}

// Importable for tests; only the CLI path runs the API calls.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => fail(error?.stack || String(error)))
}
