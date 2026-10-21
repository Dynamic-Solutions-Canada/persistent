/** Recipient-only email preference lookup. Never infer recipient language from the sender. */
import { normalizeLocaleOverride, type Locale } from '@persistent/shared'
import { prisma } from './prisma.js'

/** A delivery preference for an exact address, never account content or an existence response. */
export async function recipientEmailLocale(email: string): Promise<Locale> {
  const recipient = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { emailLanguage: true }
  })
  return normalizeLocaleOverride(recipient?.emailLanguage) ?? 'en-US'
}
