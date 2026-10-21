/** Localized application errors, retaining detailed external errors without interpreting them as catalog keys. */
import { applicationErrorCode, extractErrorMessage as extractSharedError } from '@persistent/shared'
import { tr } from './i18n.js'

/** Known application errors use stable identifiers; provider text and user text pass through literally. */
export function extractErrorMessage(value: unknown, fallback = tr('Something went wrong.')): string {
  const extracted = extractSharedError(value, fallback)
  const code = applicationErrorCode(extracted)
  return code ? tr(code) : extracted
}
