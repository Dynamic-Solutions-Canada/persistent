/** Localized sign-in mail, with a fixed lifetime and no dependence on a recipient's time zone. */
import { message, type Locale } from '@persistent/shared'

/** The code is generated digits only; all other content comes from trusted application catalogs. */
export function buildVerificationEmail(code: string, locale: Locale = 'en-US') {
  const intro = message(locale, 'Use this one-time code to sign in to Persistent:')
  const expiry = message(locale, 'This code expires in 10 minutes.')
  const ignore = message(locale, 'If you did not request this code, you can ignore this email.')
  return {
    subject: message(locale, 'Your Persistent sign-in code'),
    text: [intro, '', code, '', expiry, ignore].join('\n'),
    html: `<html lang="${locale}"><body><p>${intro}</p><p><strong style="font-size:1.5rem;letter-spacing:0.12em;font-family:ui-monospace,Menlo,monospace;">${code}</strong></p><p>${expiry}</p><p>${ignore}</p></body></html>`
  }
}
