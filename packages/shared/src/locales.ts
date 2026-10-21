/** Canonical locale identities and additive presentation preferences across all clients. */
import { z } from 'zod'

export const supportedLocales = ['en-US', 'en-CA', 'es-ES', 'fr-FR', 'fr-CA', 'de-DE', 'zh-CN', 'pt-BR', 'ja-JP'] as const
export const localeSchema = z.enum(supportedLocales)
export type Locale = z.infer<typeof localeSchema>
export const DEFAULT_LOCALE: Locale = 'en-US'

/** Regional identities survive even when their current wording shares a catalog. */
export const localeCatalogs = {
  'en-US': 'en-US', 'en-CA': 'en-US', 'es-ES': 'es-ES', 'fr-FR': 'fr-FR',
  'fr-CA': 'fr-FR', 'de-DE': 'de-DE', 'zh-CN': 'zh-CN', 'pt-BR': 'pt-BR', 'ja-JP': 'ja-JP'
} as const satisfies Record<Locale, Locale>

export const localeNames: Record<Locale, string> = {
  'en-US': 'English (United States)', 'en-CA': 'English (Canada)', 'es-ES': 'Español (España)',
  'fr-FR': 'Français (France)', 'fr-CA': 'Français (Canada)', 'de-DE': 'Deutsch (Deutschland)',
  'zh-CN': '简体中文（中国）', 'pt-BR': 'Português (Brasil)', 'ja-JP': '日本語（日本）'
}

/** Canonicalizes a valid regional formatting tag; unknown or malformed values mean device default. */
export function normalizeFormattingLocale(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 100) return null
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null
  } catch {
    return null
  }
}

/** Explicit language choices must be supported identities, rather than inferred relatives. */
export function normalizeLocaleOverride(value: unknown): Locale | null {
  if (typeof value !== 'string') return null
  return supportedLocales.find((locale) => locale.toLowerCase() === value.trim().toLowerCase()) ?? null
}

/** Returns a safe wording family, honoring explicit scripts and Traditional Chinese regions. */
function languageFamily(tag: string): string {
  const locale = new Intl.Locale(tag)
  const { language, script, region } = locale
  if (language === 'zh') {
    if (script) return `zh-${script}`
    return region && ['TW', 'HK', 'MO'].includes(region) ? 'zh-Hant' : 'zh-Hans'
  }
  if (script && !(script === 'Latn' && ['en', 'es', 'fr', 'de', 'pt'].includes(language))) {
    return `${language}-${script}`
  }
  return language
}

/**
 * Picks the first supported device preference, trying exact identity before regional relatives.
 * Unsupported scripts are skipped; Traditional Chinese never chooses the Simplified catalog.
 */
export function resolveLocale(preferences: readonly string[], override?: unknown): Locale {
  const explicit = normalizeLocaleOverride(override)
  if (explicit) return explicit
  for (const preference of preferences) {
    const canonical = normalizeFormattingLocale(preference)
    if (!canonical) continue
    const parsed = new Intl.Locale(canonical)
    const script = parsed.script === 'Latn' && ['en', 'es', 'fr', 'de', 'pt'].includes(parsed.language)
      ? undefined : parsed.script
    const exactTag = [parsed.language, script, parsed.region].filter(Boolean).join('-')
    const exact = normalizeLocaleOverride(exactTag)
    if (exact) return exact
    const family = languageFamily(canonical)
    const relative = supportedLocales.find((locale) => languageFamily(locale) === family)
    if (relative) return relative
  }
  return DEFAULT_LOCALE
}

/** Per-device preferences. Null means Match device; formatting never changes alarm time zones. */
export const localePreferencesSchema = z.object({
  languageOverride: localeSchema.nullable().default(null),
  formattingLocaleOverride: z.string().max(100).refine((value) => normalizeFormattingLocale(value) !== null).nullable().default(null)
})
export type LocalePreferences = z.infer<typeof localePreferencesSchema>

/** Additive, display-only bridge payload; hosts persist it for offline/background/restart presentation. */
export const nativeLocaleSchema = localePreferencesSchema.extend({
  version: z.literal(1),
  resolvedLocale: localeSchema,
  formattingLocale: z.string().max(100).refine((value) => normalizeFormattingLocale(value) !== null),
  timeFormat: z.enum(['12h', '24h']),
  timeFormatChosen: z.boolean()
})
export type NativeLocale = z.infer<typeof nativeLocaleSchema>

/** Native OS language selection, read before mirroring web preferences to avoid overwriting a newer OS choice. */
export const nativeLanguageStateSchema = z.object({
  version: z.literal(1),
  languageOverride: localeSchema.nullable(),
  deviceLanguages: z.array(z.string().max(100)).max(100)
})
export type NativeLanguageState = z.infer<typeof nativeLanguageStateSchema>

/** Account-owned email language is changed only by an explicit authenticated preference write. */
export const accountLanguageInputSchema = z.object({ emailLanguage: localeSchema })
export type AccountLanguageInput = z.infer<typeof accountLanguageInputSchema>

/** Resolved device wording sent on same-origin requests, independently of account email language. */
export const LOCALE_HEADER = 'X-Persistent-Locale'
