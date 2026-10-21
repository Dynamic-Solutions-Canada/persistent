/** Device wording for the current request, independent of the account's email preference. */
import { LOCALE_HEADER, normalizeLocaleOverride, resolveLocale, type Locale } from '@persistent/shared'
import type { Request } from 'express'

/** Native query/header values are resolved identities; older clients retain weighted HTTP language negotiation. */
export function requestLocale(request: Pick<Request, 'get' | 'query'>): Locale {
  const explicit = normalizeLocaleOverride(request.get(LOCALE_HEADER)) ?? normalizeLocaleOverride(request.query.locale)
  if (explicit) return explicit
  return resolveLocale(acceptedLanguages(request.get('Accept-Language') ?? ''))
}

/** Parse HTTP language weights stably, excluding q=0 and malformed weights. */
export function acceptedLanguages(header: string): string[] {
  return header.split(',').map((entry, index) => {
    const [tag = '', ...parameters] = entry.trim().split(';')
    const weight = parameters.find((parameter) => parameter.trim().startsWith('q='))?.trim().slice(2)
    const quality = weight === undefined ? 1 : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(weight) ? Number(weight) : 0
    return { tag: tag.trim(), quality, index }
  }).filter(({ tag, quality }) => tag.length > 0 && quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map(({ tag }) => tag)
}
