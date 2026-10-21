/** Additive localized errors preserve the legacy English wire message. */
import { applicationErrorCode, message, type ApiErrorBody, type Locale } from '@persistent/shared'

/** Only known application errors have message keys; unknown errors use a fixed status fallback. */
export function localizedError(error: string, locale: Locale): ApiErrorBody {
  const code = applicationErrorCode(error) ?? 'error.request-failed'
  return { error, code, message: message(locale, code) }
}
