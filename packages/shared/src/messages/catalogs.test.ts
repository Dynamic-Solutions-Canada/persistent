import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import { catalogFor, catalogs, message } from './catalogs.js'
import { supportedLocales } from '../locales.js'
import { reminderStatLabels, occurrenceStatLabels, collaborationStatLabels } from '../admin.js'
import { promotionCopy, promotionCopyKeys } from './promotions.js'

/** Compare placeholders and rich-text slots while allowing translators to reorder whole phrases. */
function markers(value: string): string[] {
  return [...value.matchAll(/{{\s*\w+\s*}}|<\/?(?:[cv]\d+|br)\s*\/?>/g)].map((match) => match[0]).sort()
}

test('every bundled catalog has exactly the English keys, placeholders and rich-text slots', () => {
  const english = catalogs['en-US']!
  for (const [locale, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(english).sort(), locale)
    for (const [key, source] of Object.entries(english)) {
      const value = catalog[key]!
      assert.ok(value.trim(), `${locale}: ${key}`)
      assert.deepEqual(markers(value), markers(source), `${locale}: ${key}`)
      assert.doesNotMatch(value, /&(?:apos|quot|amp|lt|gt);/, `${locale}: JSX entities in ${key}`)
      assert.doesNotMatch(value, /—/, `${locale}: ${key}`)
    }
  }
  assert.equal(catalogFor('en-CA'), catalogFor('en-US'))
  assert.equal(catalogFor('fr-CA'), catalogFor('fr-FR'))
})

test('interpolated reminder and medicine text is never interpreted as another template', () => {
  assert.equal(message('fr-FR', '__proto__'), '__proto__')
  const body = 'Insulin 10 units · <script> {{body}} & medicine'
  for (const locale of supportedLocales) {
    const value = message(locale, '{{body}} (escalated)', { body })
    assert.ok(value.includes(body), locale)
    assert.equal(value.split(body).length, 2, locale)
  }
})

/** Find application sources without descending into generated native trees or dependencies. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', 'android', 'external', 'obj', 'bin'].includes(entry.name)) return []
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:tsx?|kt|cs|xaml|html)$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : []
  })
}

test('literal application translation calls and rich messages all have catalog entries', () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url))
  const english = catalogs['en-US']!
  for (const key of [...Object.values(reminderStatLabels), ...Object.values(occurrenceStatLabels), ...Object.values(collaborationStatLabels), ...promotionCopyKeys]) assert.ok(english[key], key)
  const missing = new Set<string>()
  const check = (key: string, path: string) => {
    if (!key || english[key] || english[`${key}_other`]) return
    missing.add(`${path.slice(root.length)}: ${key}`)
  }
  for (const path of sourceFiles(`${root}apps`)) {
    const text = readFileSync(path, 'utf8')
    if (/\.tsx?$/.test(path)) {
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          const name = node.expression.getText(source)
          const index = ['message', 'NativeText.text'].includes(name) ? 1 : 0
          if (['tr', 'nativeText', 'message'].includes(name)) {
            const argument = node.arguments[index]
            if (argument && ts.isStringLiteralLike(argument)) check(argument.text, path)
            if (argument && ts.isConditionalExpression(argument)) {
              for (const branch of [argument.whenTrue, argument.whenFalse]) if (ts.isStringLiteralLike(branch)) check(branch.text, path)
            }
          }
        }
        if (ts.isJsxAttribute(node) && node.name.getText(source) === 'i18nKey') {
          const initializer = node.initializer
          const value = initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer
          if (value && ts.isStringLiteralLike(value)) check(value.text, path)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    } else {
      const pattern = /(?:UiText\.(?:Get|Format)\(|NativeText\.text\([^,\n]+,\s*)"((?:\\.|[^"\\])*)"|l10n:Localize\.\w+="([^"]+)"|data-i18n(?:-\w+)?="([^"]+)"/g
      for (const match of text.matchAll(pattern)) {
        check(match[1] ? JSON.parse(`"${match[1]}"`) as string : (match[2] ?? match[3] ?? ''), path)
      }
    }
  }
  assert.deepEqual([...missing].sort(), [])
})

test('known promo copy translates while brands and unfamiliar remote copy remain literal', () => {
  assert.equal(promotionCopy('ja-JP', 'Visit website'), 'Web サイトを見る')
  for (const value of ['PrintStream', 'Windows', 'https://printstream.app', 'A new remote description {{body}}']) {
    assert.equal(promotionCopy('ja-JP', value), value)
  }
})

test('native supported-language declarations retain all nine canonical identities', () => {
  const root = new URL('../../../../', import.meta.url)
  const manifest = readFileSync(new URL('apps/desktop/Persistent.DesktopMSIX/Package.appxmanifest', root), 'utf8')
  assert.deepEqual([...manifest.matchAll(/<Resource Language="([^"]+)"/g)].map(match => match[1]), [...supportedLocales])
  const setup = readFileSync(new URL('apps/mobile/scripts/setup-android.mjs', root), 'utf8')
  const list = setup.match(/const localeIds = \[([^\]]+)\]/)?.[1]
  assert.ok(list)
  assert.deepEqual([...list.matchAll(/'([^']+)'/g)].map(match => match[1]), [...supportedLocales])
  assert.ok(setup.includes('android:localeConfig="@xml/locale_config"'))
})

test('installed shell and widget-picker resource bindings have canonical translations for every locale', () => {
  const manifest = readFileSync(new URL('../../../../apps/desktop/Persistent.DesktopMSIX/Package.appxmanifest', import.meta.url), 'utf8')
  const keys = [...new Set([...manifest.matchAll(/ms-resource:\/\/Persistent\.Desktop\/Resources\/([A-Za-z0-9]+)/g)].map(match => match[1]!))]
  assert.ok(keys.length >= 4, 'Shell description, provider label, widget description and accessible preview text are bound')
  for (const locale of supportedLocales) {
    for (const key of keys) {
      const translated = catalogFor(locale)[key]
      assert.ok(translated && translated !== key, `${locale}: ${key}`)
      assert.match(translated, /Persistent|notification|notific|Infobereich|通知/i, `${locale}: ${key}`)
    }
  }
})
