/**
 * The synthetic sample data the Store screenshots show, in each listing language
 * (store-assets/demo-text.json). Reminder text is the user's own and is never translated by
 * the app, so a localized screenshot needs localized sample data: the seed, shots:prepare and
 * both capture loops (Windows and the phone) read their strings from here.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** One reminder's visible text; `items` is a checklist in display order. */
export interface DemoReminderText {
  title: string
  details?: string
  items?: string[]
  medication?: string
  unit?: string
}

/** Every string one locale's screenshots show, keyed by scenario. */
export type DemoText = Record<string, DemoReminderText>

interface DemoTextFile {
  schemaVersion: number
  locales: Record<string, DemoText>
}

/** Where the file lives, relative to the repository root (every caller runs from there). */
export const DEMO_TEXT_FILE = 'store-assets/demo-text.json'

/** The locale every listing falls back to, and the one the production demo account uses. */
export const DEFAULT_DEMO_LOCALE = 'en-US'

/** Read the whole file. Throws when it is not schema version 1. */
export function readDemoTextFile(path = DEMO_TEXT_FILE): DemoTextFile {
  const parsed = JSON.parse(readFileSync(resolve(path), 'utf8')) as DemoTextFile
  if (parsed?.schemaVersion !== 1 || !parsed.locales)
    throw new Error(`${path}: expected schemaVersion 1 and locales.`)
  return parsed
}

/**
 * One locale's sample text. Throws, naming the locales that exist, when it has none: a
 * capture must never fall back to English data in a translated listing.
 */
export function demoText(
  locale = DEFAULT_DEMO_LOCALE,
  file = readDemoTextFile(),
): DemoText {
  const text = file.locales[locale]
  if (!text)
    throw new Error(
      `${DEMO_TEXT_FILE} has no ${locale} record (has ${Object.keys(file.locales).join(', ')}).`,
    )
  return text
}

/**
 * The locales a listing captures for: every locale with its own record. A `copyFrom` locale
 * (en-CA, fr-CA) uploads its target's images, so it is never captured.
 */
export function captureLocales(listingsPath: string): string[] {
  const listings = JSON.parse(readFileSync(resolve(listingsPath), 'utf8')) as {
    locales: Record<string, { copyFrom?: string }>
  }
  return Object.entries(listings.locales)
    .filter(([, record]) => !record.copyFrom)
    .map(([locale]) => locale)
}

/**
 * Everything wrong with the file, as messages: a locale whose scenarios, fields or checklist
 * lengths differ from en-US (checklist item ids are shared, so the lengths must match), an
 * empty string, or an em dash. Empty means usable.
 */
export function demoTextProblems(file: DemoTextFile): string[] {
  const problems: string[] = []
  const reference = file.locales[DEFAULT_DEMO_LOCALE]
  if (!reference) return [`no ${DEFAULT_DEMO_LOCALE} record`]

  for (const [locale, text] of Object.entries(file.locales)) {
    const scenarios = Object.keys(text).sort().join(',')
    if (scenarios !== Object.keys(reference).sort().join(','))
      problems.push(`${locale}: scenarios differ from ${DEFAULT_DEMO_LOCALE}`)

    for (const [scenario, expected] of Object.entries(reference)) {
      const actual = text[scenario]
      if (!actual) continue
      if (
        Object.keys(actual).sort().join() !==
        Object.keys(expected).sort().join()
      )
        problems.push(
          `${locale}.${scenario}: fields differ from ${DEFAULT_DEMO_LOCALE}`,
        )
      if ((actual.items?.length ?? 0) !== (expected.items?.length ?? 0))
        problems.push(`${locale}.${scenario}: checklist length differs`)

      const strings = [
        actual.title,
        actual.details,
        actual.medication,
        actual.unit,
        ...(actual.items ?? []),
      ].filter((value) => value !== undefined)
      for (const value of strings) {
        if (typeof value !== 'string' || !value.trim())
          problems.push(`${locale}.${scenario}: empty text`)
        else if (value.includes('\u2014'))
          problems.push(`${locale}.${scenario}: em dash in "${value}"`)
      }
    }
  }
  return problems
}
