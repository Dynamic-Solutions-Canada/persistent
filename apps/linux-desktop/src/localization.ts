/** Process-local display state. Shared contracts own matching, catalogs and bridge validation. */
import { catalogFor, message, nativeLocaleSchema, resolveLocale, type NativeLocale } from '@persistent/shared'

let preferences: NativeLocale | undefined
let deviceLanguages = [new Intl.DateTimeFormat().resolvedOptions().locale]
const listeners = new Set<() => void>()

export function nativeLocale(): ReturnType<typeof resolveLocale> {
  return resolveLocale(deviceLanguages, preferences?.languageOverride)
}

/** Initialize from host persistence and the OS's current ordered preferences. */
export function initializeNativeText(value?: NativeLocale, languages?: string[]): void {
  preferences = value
  if (languages?.length) deviceLanguages = languages
}

/** Validate the additive web payload before a host persists or presents it. */
export function applyNativeLocale(value: unknown): NativeLocale | null {
  const parsed = nativeLocaleSchema.safeParse(value)
  if (!parsed.success) return null
  if (JSON.stringify(preferences) === JSON.stringify(parsed.data)) return parsed.data
  preferences = parsed.data
  for (const listener of listeners) listener()
  return parsed.data
}

export function nativeText(key: string, parameters: Record<string, string | number> = {}): string {
  return message(nativeLocale(), key, parameters)
}

/** Local renderers receive only trusted display strings and locale identity. */
export function localizationSnapshot() {
  const language = nativeLocale()
  return { language, strings: catalogFor(language) }
}

export function onNativeLocaleChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
