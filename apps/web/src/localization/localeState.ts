/** Resolved per-device presentation state for non-React date and HTTP helpers. */
import { normalizeFormattingLocale, normalizeLocaleOverride, resolveLocale, type Locale, type LocalePreferences } from '@persistent/shared'

/** Browser preferences are ordered and may change while the resident app is open. */
export function deviceLanguages(): string[] {
  if (typeof navigator === 'undefined') return ['en-US']
  return navigator.languages?.length ? [...navigator.languages] : [navigator.language || 'en-US']
}

/** Read only the two locale preferences, retaining every unrelated setting in its existing owner. */
export function readLocalePreferences(value?: unknown): LocalePreferences {
  let stored = value
  if (stored === undefined) {
    try {
      stored = JSON.parse(localStorage.getItem('persistent-settings') ?? '{}')
    } catch {
      stored = {}
    }
  }
  const raw = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {}
  return {
    languageOverride: normalizeLocaleOverride(raw.languageOverride),
    formattingLocaleOverride: normalizeFormattingLocale(raw.formattingLocaleOverride)
  }
}

/** Formatting uses the actual regional locale, including calendar/numeral extensions, independently of wording. */
export function resolveFormattingLocale(preferences: readonly string[], override: string | null): string {
  return normalizeFormattingLocale(override) ?? preferences.map(normalizeFormattingLocale).find((locale) => locale !== null) ?? 'en-US'
}

const initial = readLocalePreferences()
let activeLocale = resolveLocale(deviceLanguages(), initial.languageOverride)
let activeFormattingLocale = resolveFormattingLocale(deviceLanguages(), initial.formattingLocaleOverride)

export function getLocale(): Locale { return activeLocale }
export function getFormattingLocale(): string { return activeFormattingLocale }

/** Update presentation only; no account, reminder, time-zone or scheduling state changes. */
export function setPresentationLocale(locale: Locale, formattingLocale: string): void {
  activeLocale = locale
  activeFormattingLocale = formattingLocale
}
