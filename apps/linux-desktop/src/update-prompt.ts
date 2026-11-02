/** Separate update consent stages use stable protocol actions and localized display text. */
import { nativeText } from './localization.js'

export function updatePrompt(action: 'download' | 'install', version: string) {
  const download = action === 'download'
  return {
    type: 'question' as const,
    title: nativeText('Persistent update'),
    message: download ? nativeText('Download Persistent version {{v0}}?', { v0: version }) : nativeText('Install version {{v0}} and restart Persistent?', { v0: version }),
    detail: download ? nativeText('The app keeps running while the update downloads.') : nativeText('Desktop alerts pause briefly during restart. Your saved sign-in and settings are preserved. Finish any unsaved edits before restarting.'),
    buttons: [nativeText('Later'), download ? nativeText('Download update') : nativeText('Install and restart')],
    defaultId: 0, cancelId: 0
  }
}
