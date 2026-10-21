/** Known publisher-owned promo copy. New remote copy stays literal until catalogued and translated. */
import type { Locale } from '../locales.js'
import { catalogs, message } from './catalogs.js'

export const promotionCopyKeys = [
  'Our other apps', 'promo.store-subtitle', 'promo.website', 'promo.view-store',
  'promo.printstream', 'promo.little-launcher', 'promo.immichdrive', 'promo.repilot', 'promo.persistent'
] as const

/** Translate an exact known source sentence; never interpret product names, destinations or arbitrary provider strings as keys. */
export function promotionCopy(locale: Locale, value: string): string {
  const key = promotionCopyKeys.find((candidate) => catalogs['en-US']![candidate] === value)
  return key ? message(locale, key) : value
}
