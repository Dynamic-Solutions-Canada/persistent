/** The desktop settings window uses the same validated publisher catalog as Windows and web. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCatalog, type CatalogApp } from '../../desktop/external/promo/catalog.js'

/** Read bundled, offline-available app data; links and icon names pass the shared catalog validator. */
export function settingsCatalog(root: string): CatalogApp[] {
  return parseCatalog(JSON.parse(readFileSync(join(root, 'resources/promo/apps.json'), 'utf8')))
    .filter((app) => app.appId !== 'persistent')
}
