/** Translating display wording must never turn download consent into installation consent. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supportedLocales } from '@persistent/shared'
import { initializeNativeText, nativeText } from './localization.js'
import { updatePrompt } from './update-prompt.js'

test('download and install consent stay distinct in every supported language', () => {
  try {
    for (const language of supportedLocales) {
      initializeNativeText(undefined, [language])
      const download = updatePrompt('download', '0.2.0')
      const install = updatePrompt('install', '0.2.0')
      assert.equal(download.message, nativeText('Download Persistent version {{v0}}?', { v0: '0.2.0' }), language)
      assert.equal(download.detail, nativeText('The app keeps running while the update downloads.'), language)
      assert.equal(download.buttons[1], nativeText('Download update'), language)
      assert.equal(install.message, nativeText('Install version {{v0}} and restart Persistent?', { v0: '0.2.0' }), language)
      assert.equal(install.buttons[1], nativeText('Install and restart'), language)
      assert.notEqual(download.detail, install.detail, language)
      assert.equal(download.defaultId, 0)
      assert.equal(install.cancelId, 0)
    }
  } finally { initializeNativeText(undefined, ['en-US']) }
})
