import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { DEVICE_STORAGE_KEYS } from './deviceStorage.js'

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/** Every non-test source file under apps/web/src. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return sourceFiles(file)
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return []
    return [file]
  })
}

test('browser storage is only ever addressed through the declared keys', () => {
  const literal = /(?:local|session)Storage\.(?:get|set|remove)Item\(\s*['"`]/
  const offenders = sourceFiles(sourceRoot).filter((file) =>
    literal.test(readFileSync(file, 'utf8')),
  )
  assert.deepEqual(
    offenders.map((file) => path.relative(sourceRoot, file)),
    [],
    'Declare the key in lib/deviceStorage.ts and import it instead.',
  )
})

test('every declared key is unique and new keys follow persistent.<area>.<name>', () => {
  const keys = DEVICE_STORAGE_KEYS.map((entry) => entry.key)
  assert.equal(new Set(keys).size, keys.length)
  // The historical names are frozen; anything else must use the D-105 grammar.
  const historical = new Set([
    'persistent-settings',
    'joy-mode',
    'persistent-offline-session',
    'persistent-query-cache',
    'persistent-promoted-apps-v1',
    'persistent-hide-native-apps-banner',
    'persistent-permission-guide-offered',
    'persistent-play-migration-notice-seen',
  ])
  for (const key of keys) {
    if (historical.has(key)) continue
    assert.match(key, /^persistent\.[a-z-]+\.[a-z-]+(\.v\d+)?$/, key)
  }
})
