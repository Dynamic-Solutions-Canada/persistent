import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localeCatalogs, nativeLocaleSchema, normalizeLocaleOverride, resolveLocale } from './locales.js'

test('ordered matching retains regional identities and canonical aliases', () => {
  assert.equal(resolveLocale(['fr-CA', 'en-US']), 'fr-CA')
  assert.equal(resolveLocale(['fr-BE', 'en-CA']), 'fr-FR')
  assert.equal(resolveLocale(['xx', 'en-Latn-CA']), 'en-CA')
  assert.equal(resolveLocale(['ja-JP'], 'EN-ca'), 'en-CA')
  assert.equal(localeCatalogs['fr-CA'], 'fr-FR')
  assert.equal(normalizeLocaleOverride('fr-BE'), null)
})

test('matching respects script boundaries and falls back to English', () => {
  for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-CN', 'en-Cyrl', 'invalid_tag']) {
    assert.equal(resolveLocale([tag]), 'en-US', tag)
    assert.equal(resolveLocale([tag, 'ja']), 'ja-JP', tag)
  }
  for (const tag of ['zh', 'zh-SG', 'zh-Hans-TW', 'zh-Hans-CN']) {
    assert.equal(resolveLocale([tag]), 'zh-CN', tag)
  }
})

test('native preferences keep wording, formatting and explicit time choice separate', () => {
  const value = nativeLocaleSchema.parse({
    version: 1, languageOverride: 'fr-CA', formattingLocaleOverride: 'de-DE',
    resolvedLocale: 'fr-CA', formattingLocale: 'de-DE', timeFormat: '12h', timeFormatChosen: true
  })
  assert.equal(value.resolvedLocale, 'fr-CA')
  assert.equal(value.formattingLocale, 'de-DE')
  assert.equal(value.timeFormat, '12h')
  assert.equal(nativeLocaleSchema.safeParse({ ...value, formattingLocale: 'broken_tag' }).success, false)
})
