import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test'
const { renamedSetting } = await import('./env.js')

const previous = (value: string | undefined) => ({
  name: 'ANDROID_APP_ORIGIN',
  value,
})

test('the new name wins over the old one', () => {
  assert.deepEqual(renamedSetting('new', previous('old')), {
    value: 'new',
    deprecatedName: null,
  })
})

test('the old name is read, and named, only when the new one is unset', () => {
  assert.deepEqual(renamedSetting(undefined, previous('old')), {
    value: 'old',
    deprecatedName: 'ANDROID_APP_ORIGIN',
  })
})

test('neither name leaves the setting unset, with nothing to warn about', () => {
  assert.deepEqual(renamedSetting(undefined, previous(undefined)), {
    value: undefined,
    deprecatedName: null,
  })
})
