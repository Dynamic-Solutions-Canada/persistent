/** Pure application catalogs, shared by web, server and generated native resources. */
import { localeCatalogs, type Locale } from '../locales.js'
import enUS from './en-US.json' with { type: 'json' }
import jaJP from './ja-JP.json' with { type: 'json' }
import ptBR from './pt-BR.json' with { type: 'json' }
import zhCN from './zh-CN.json' with { type: 'json' }
import deDE from './de-DE.json' with { type: 'json' }
import frFR from './fr-FR.json' with { type: 'json' }
import esES from './es-ES.json' with { type: 'json' }

export const catalogs: Record<string, Readonly<Record<string, string>>> = { 'en-US': enUS, 'es-ES': esES, 'fr-FR': frFR, 'de-DE': deDE, 'zh-CN': zhCN, 'pt-BR': ptBR, 'ja-JP': jaJP }

/** Resolve a catalog without collapsing the caller's regional locale identity. */
export function catalogFor(locale: Locale): Readonly<Record<string, string>> {
  return catalogs[localeCatalogs[locale]] ?? enUS
}

/** Format a fixed application template; inserted text is never reinterpreted as markup or another key. */
export function message(locale: Locale, key: string, parameters: Record<string, string | number> = {}): string {
  const translated = Object.hasOwn(catalogFor(locale), key) ? catalogFor(locale)[key] : undefined
  const template = translated ?? (Object.hasOwn(enUS, key) ? (enUS as Readonly<Record<string, string>>)[key] : undefined) ?? key
  return template.replace(/{{\s*(\w+)\s*}}/g, (token, name: string) =>
    Object.hasOwn(parameters, name) ? String(parameters[name]) : token)
}
