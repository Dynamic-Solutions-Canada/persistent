/** Merge approved screenshots and notes into an existing Store draft without resetting other fields. */
import { member, setMember } from './windows-store-members.mjs'
import { mergeStoreScreenshots } from './windows-store-screenshots.mjs'

export { member }

/** Require the exact CLI input filename, not the bundle nested inside an upload wrapper. */
export function assertReleasePackage(draft, fileName) {
  const packages = member(draft, 'applicationPackages')
  if (
    !Array.isArray(packages) ||
    !packages.some((entry) => member(entry, 'fileName') === fileName)
  ) {
    throw new Error(
      'The Store draft does not contain the selected release package.',
    )
  }
}

/**
 * Set every listing's release notes, in place.
 * @param notes listing locale (any case) to that locale's approved text, from release-notes/
 *   (LIST-10). Every listing in the draft must have one: a listing left with last release's
 *   notes would be wrong, so a gap fails before anything is uploaded.
 */
function setReleaseNotes(submission, notes) {
  const notesFor = (locale) =>
    Object.entries(notes).find(
      ([key]) => key.toLowerCase() === locale.toLowerCase(),
    )?.[1]
  const listings = member(submission, 'listings') ?? {}
  for (const [locale, entry] of Object.entries(listings)) {
    const text = notesFor(locale)?.trim()
    if (!text) throw new Error(`No release notes for the ${locale} listing.`)
    if (text.length > 1500)
      throw new Error(`The ${locale} release notes are over 1500 characters.`)
    const base = member(entry, 'baseListing')
    if (base) setMember(base, 'releaseNotes', text)
  }
}

/**
 * Replace every listing's screenshots with its planned set and set its release notes; preserve
 * logos, other copy, packages and policy. The draft itself is not changed.
 * @param plan from resolveStoreScreenshots, covering every listing in the draft
 * @param notes see setReleaseNotes
 * @returns the updated submission to PUT
 */
export function mergeStoreListing(draft, plan, notes) {
  const updated = structuredClone(draft)
  const listings = member(updated, 'listings') ?? {}
  if (!Object.keys(listings).some((key) => key.toLowerCase() === 'en-us'))
    throw new Error('The pending Store submission has no English listing.')
  setReleaseNotes(updated, notes)
  return mergeStoreScreenshots(updated, plan)
}
