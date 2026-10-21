/** Bundled, offline-capable translation runtime. Locale matching lives in the shared contract. */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { catalogs, localeCatalogs, supportedLocales, type Locale } from '@persistent/shared'
import { getLocale, getFormattingLocale, setPresentationLocale } from './localeState.js'

export const i18n = i18next.createInstance()
void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(supportedLocales.map((locale) => [locale, { translation: catalogs[localeCatalogs[locale]] ?? catalogs['en-US']! }])),
  lng: getLocale(),
  supportedLngs: [...supportedLocales],
  fallbackLng: 'en-US',
  load: 'currentOnly',
  keySeparator: false,
  nsSeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false, bindI18n: 'languageChanged presentationChanged' }
})

/** Translate application-owned wording only. React escapes output and interpolated user text. */
export function tr(key: string, parameters?: Record<string, unknown>): string {
  return i18n.t(key, parameters ?? {}) as string
}

/** Change language in place so editing state and offline mutations survive. */
export function configureLocale(locale: Locale, formattingLocale: string): void {
  const formattingChanged = getFormattingLocale() !== formattingLocale
  setPresentationLocale(locale, formattingLocale)
  if (i18n.language !== locale) void i18n.changeLanguage(locale)
  else if (formattingChanged) i18n.emit('presentationChanged')
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}
