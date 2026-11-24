/**
 * The Microsoft Store screenshot set for every listing locale, and how it replaces a draft's
 * screenshots (D-123, LIST-8). A JavaScript port of winui-app-kit v2.7.1's
 * resolve-, merge- and confirm-store-screenshots.ps1, so Persistent's listings behave like the
 * WinUI apps': each locale gets its generated hero first (a copyFrom locale uses its target's),
 * then the shared screenshots in manifest order, captioned in that locale.
 *
 * Everything here is pure: no file or Store access, so the plan is testable on Linux and the
 * publisher's check mode can exercise it without credentials.
 */
import { member, setMember } from './windows-store-members.mjs'

const LOCALE_TOKEN = '{locale}'
const MAX_DESCRIPTION = 200

/**
 * The listings.json record for a locale (any case), following one copyFrom.
 * @param records listings.json `locales`
 * @returns `{ name, record }`, where name is the locale whose record holds the text (the
 *   copyFrom target for an alias), or undefined when the listing has no such locale.
 */
function findRecord(records, locale) {
  const name = Object.keys(records).find(
    (candidate) => candidate.toLowerCase() === locale.toLowerCase(),
  )
  if (!name) return undefined
  const target = records[name].copyFrom
  if (!target) return { name, record: records[name] }
  if (!records[target] || records[target].copyFrom)
    throw new Error(
      `listings.json: ${name} copies ${target}, which has no text.`,
    )
  return { name: target, record: records[target] }
}

/**
 * Plan the screenshots for each listing locale, without reading any image.
 * @param manifest store-assets/manifest.json; its `microsoft` entries in listing order, each
 *   `file` under store-assets/microsoft/. The entry with a `hero` block has `{locale}` in it.
 * @param listings store-assets/microsoft/listings.json
 * @param listingLocales the locales to plan: the draft's listings, or every listings.json
 *   locale in check mode
 * @returns `{ locales, files, fallback }`: locales maps each lower-case listing locale to its
 *   images in order, each `{ source, fileName, description }` (source under store-assets/,
 *   fileName the archive name `<locale>/<file name>`, description that locale's caption);
 *   files lists every image once; fallback lists locales with no record, which take the en-US
 *   set, as they take the English release notes.
 * @throws when there are not 1 to 10 screenshots, a locale's caption count differs, a caption
 *   is empty or over 200 characters, or two images in one locale share a file name.
 */
export function resolveStoreScreenshots(manifest, listings, listingLocales) {
  const entries = manifest.microsoft ?? []
  if (entries.length < 1 || entries.length > 10)
    throw new Error(
      `The Store takes 1 to 10 screenshots; the manifest lists ${entries.length}.`,
    )
  const records = listings.locales ?? {}
  const english = findRecord(records, 'en-US')
  if (!english) throw new Error('listings.json has no en-US record.')

  const locales = new Map()
  const files = []
  const fallback = []
  for (const locale of listingLocales) {
    const key = locale.toLowerCase()
    let found = findRecord(records, locale)
    if (!found) {
      found = english
      fallback.push(key)
    }

    const captions = found.record.screenshotCaptions ?? []
    if (captions.length !== entries.length)
      throw new Error(
        `listings.json: ${found.name} has ${captions.length} screenshot captions for ${entries.length} screenshots.`,
      )

    const images = entries.map((entry, index) => {
      // A hero is drawn per listing locale; every other screenshot is shared.
      const file = entry.hero
        ? entry.file.replace(LOCALE_TOKEN, found.name)
        : entry.file
      if (file.includes(LOCALE_TOKEN))
        throw new Error(`Only the hero may have a per-locale path: ${file}`)
      const description = String(captions[index] ?? '').trim()
      if (!description || description.length > MAX_DESCRIPTION)
        throw new Error(
          `listings.json: ${found.name} caption ${index + 1} must be 1 to ${MAX_DESCRIPTION} characters.`,
        )
      return {
        source: `microsoft/${file}`,
        fileName: `${key}/${file.split('/').at(-1)}`,
        description,
      }
    })
    if (new Set(images.map((image) => image.fileName)).size !== images.length)
      throw new Error(
        `Two screenshots for ${key} share a file name; give each a distinct name.`,
      )
    locales.set(key, images)
    files.push(...images)
  }
  return { locales, files, fallback }
}

/** True for a listing image of type Screenshot, in any casing the API uses. */
function isScreenshot(image) {
  return String(member(image, 'imageType')).toLowerCase() === 'screenshot'
}

/**
 * Replace every listing's screenshots with its planned set, in place; keep logos.
 *
 * The Store shows screenshots in array order, so each listing's images become the other
 * images (logos) as they were, then the new set in order as PendingUpload, then the current
 * screenshots as PendingDelete. Removed entries placed first scramble the displayed order.
 * @param submission a draft submission (mutated)
 * @param plan from resolveStoreScreenshots
 * @throws when a listing in the draft has no planned set, or no image collection.
 */
export function mergeStoreScreenshots(submission, plan) {
  const listings = member(submission, 'listings') ?? {}
  for (const [locale, entry] of Object.entries(listings)) {
    const planned = plan.locales.get(locale.toLowerCase())
    if (!planned)
      throw new Error(`No screenshots were planned for the ${locale} listing.`)
    const base = member(entry, 'baseListing')
    if (!base) throw new Error(`The ${locale} listing has no base listing.`)
    const existing = member(base, 'images') ?? []
    if (!Array.isArray(existing))
      throw new Error(`The ${locale} listing has no image collection.`)

    const kept = existing.filter((image) => image && !isScreenshot(image))
    const removed = existing
      .filter((image) => image && isScreenshot(image))
      .map((image) => {
        const copy = { ...image }
        setMember(copy, 'fileStatus', 'PendingDelete')
        return copy
      })
    const added = planned.map((image) => ({
      fileName: image.fileName,
      fileStatus: 'PendingUpload',
      imageType: 'Screenshot',
      description: image.description,
    }))
    setMember(base, 'images', [...kept, ...added, ...removed])
  }
  return submission
}

/**
 * Stop unless every listing expects exactly its planned screenshots, in display order.
 *
 * Run on a fresh read of the draft after the update and upload, so a field the Store dropped
 * or reordered fails the run instead of going unnoticed: each listing's screenshots, in array
 * order, must start with exactly the planned files as PendingUpload and have nothing after
 * them but screenshots being removed (PendingDelete). Other image types are ignored.
 * @throws naming the first listing that does not match.
 */
export function confirmStoreScreenshots(submission, plan) {
  const listings = member(submission, 'listings') ?? {}
  for (const [locale, entry] of Object.entries(listings)) {
    const expected = (plan.locales.get(locale.toLowerCase()) ?? []).map(
      (image) => image.fileName,
    )
    const images = member(member(entry, 'baseListing'), 'images') ?? []
    const screenshots = images.filter((image) => image && isScreenshot(image))
    const leading = screenshots.slice(0, expected.length)
    const inOrder =
      expected.length > 0 &&
      leading.length === expected.length &&
      leading.every(
        (image, index) =>
          member(image, 'fileName') === expected[index] &&
          member(image, 'fileStatus') === 'PendingUpload',
      )
    const restRemoved = screenshots
      .slice(expected.length)
      .every((image) => member(image, 'fileStatus') === 'PendingDelete')
    if (!inOrder || !restRemoved)
      throw new Error(
        `The Store did not keep the planned screenshots, in display order, for ${locale}.`,
      )
  }
}

/**
 * The top-level entries of the upload archive: the package and one folder per locale.
 * @param packageName the .msixupload file name the draft registered
 * @param files every planned image (resolveStoreScreenshots().files)
 */
export function archiveRoots(packageName, files) {
  const folders = new Set(files.map((image) => image.fileName.split('/')[0]))
  return [packageName, ...[...folders].sort()]
}
