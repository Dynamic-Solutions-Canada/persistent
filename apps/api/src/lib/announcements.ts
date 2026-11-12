/**
 * Curated announcements, newest first, and who each one is for. Keep ids stable
 * after publication.
 *
 * Clients receive only the shared `Announcement` fields; the audience stays here.
 */
import type { Announcement } from '@persistent/shared'

/** A curated announcement plus its audience. */
export interface CuratedAnnouncement extends Announcement {
  /**
   * Show only to accounts created before this instant. Set it when the news
   * describes a change to something people already had: an account created
   * afterwards never knew the old behavior, so the news would only confuse it.
   */
  existingAccountsBefore?: Date
}

export const announcements: readonly CuratedAnnouncement[] = [
  {
    id: 'themes-match-system',
    title: 'New themes and a new default',
    paragraphs: [
      'Persistent now has dedicated Light and Dark themes. Match system is the new default and automatically follows your device appearance.',
      'If you prefer the original look, Navy is still available in Settings, along with Forest and Plum.',
      'Doodles work with any theme. In Settings, choose a doodle color, match the theme, or select No doodles.'
    ],
    // The v0.27.0 release, which made Match system the default.
    existingAccountsBefore: new Date('2026-10-09T21:02:22Z')
  }
]

/**
 * The announcements one account should see: those in its audience that it has
 * not viewed, in the shared client shape.
 *
 * @param accountCreatedAt when the account was created, for audience cutoffs
 * @param viewedIds announcement ids this account has already dismissed
 */
export function unreadAnnouncementsFor(accountCreatedAt: Date, viewedIds: ReadonlySet<string>): Announcement[] {
  return announcements
    .filter((announcement) => !viewedIds.has(announcement.id))
    .filter((announcement) => !announcement.existingAccountsBefore || accountCreatedAt < announcement.existingAccountsBefore)
    .map(({ id, title, paragraphs }) => ({ id, title, paragraphs }))
}
