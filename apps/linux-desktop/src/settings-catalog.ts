/** The desktop settings window uses the same validated publisher catalog as Windows and web. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { blurbFor, parseCatalog, type CatalogApp } from '../../desktop/external/promo/catalog.js'

/** Read bundled, offline-available app data; links and icon names pass the shared catalog validator. */
export function settingsCatalog(root: string): CatalogApp[] {
  return parseCatalog(JSON.parse(readFileSync(join(root, 'resources/promo/apps.json'), 'utf8')))
    .filter((app) => app.appId !== 'persistent')
}

/**
 * The same catalog with each description in the given locale (apps-promo translates them),
 * falling back to English. The settings window shows these; links are unchanged.
 */
export function localizedSettingsCatalog(root: string, locale: string): CatalogApp[] {
  return settingsCatalog(root).map((app) => ({ ...app, blurb: blurbFor(app, locale) }))
}
