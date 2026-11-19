/**
 * The "download my data" file (SEC-13, D-025): every record the signed-in user owns, plus
 * what other people have shared with or assigned to them that they can already read in the
 * app. Returned by GET /api/auth/me/export as an attachment.
 *
 * Invariants:
 * - Nothing that can sign in or send to a device is exported: no session secrets, passkey
 *   credential ids or public keys, push endpoints or sign-in codes. Devices appear only by
 *   name, platform and dates.
 * - Other people appear only by the email address the user already sees beside a share or
 *   an assignment.
 * - Stored JSON settings (schedule, type data, tones, checklist ticks) are exported as
 *   stored, so the file stays faithful when those shapes grow.
 * - Timestamps are ISO-8601 in UTC. `schemaVersion` changes only when a field is removed or
 *   changes meaning; new fields are added without a bump.
 */
import { z } from 'zod'

const timestamp = z.iso.datetime()
const optionalTimestamp = timestamp.nullable()
/** A JSON value exported exactly as the database stores it. */
const stored = z.unknown()

/** One firing of an owned reminder: the user's history. */
export const accountExportOccurrenceSchema = z.object({
  scheduledFor: timestamp,
  status: z.string(),
  firedAt: optionalTimestamp,
  acknowledgedAt: optionalTimestamp,
  snoozedUntil: optionalTimestamp,
  escalatedAt: optionalTimestamp,
  escalationSilencedAt: optionalTimestamp,
  escalationEmailedAt: optionalTimestamp,
  supersededAt: optionalTimestamp,
  checkedItems: stored,
})

/** A reminder the user owns, with its settings, history and who it is shared with. */
export const accountExportReminderSchema = z.object({
  id: z.string(),
  title: z.string(),
  details: z.string().nullable(),
  type: z.string(),
  typeData: stored,
  schedule: stored,
  checkedItems: stored,
  hideCheckedItems: z.boolean(),
  persistence: z.string(),
  soundIntervalSeconds: z.number().int().nullable(),
  sounds: stored,
  shadeProminence: z.string(),
  escalateAfterMinutes: z.number().int().nullable(),
  escalateAtTime: z.string().nullable(),
  escalateEmail: z.string().nullable(),
  escalateEmailMessage: z.string().nullable(),
  escalateEmailAfterMinutes: z.number().int().nullable(),
  active: z.boolean(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  sharedWith: z.array(z.object({ email: z.string(), sharedAt: timestamp })),
  pendingInvitations: z.array(
    z.object({ email: z.string(), invitedAt: timestamp }),
  ),
  occurrences: z.array(accountExportOccurrenceSchema),
})

/** A reminder someone else shared with the user, and the user's own alert state on it. */
export const accountExportSharedWithMeSchema = z.object({
  reminderId: z.string(),
  title: z.string(),
  ownerEmail: z.string(),
  sharedAt: timestamp,
  shadeProminence: z.string(),
  alerts: z.array(
    z.object({
      scheduledFor: timestamp,
      snoozedUntil: optionalTimestamp,
      escalatedAt: optionalTimestamp,
      escalationSilencedAt: optionalTimestamp,
    }),
  ),
})

/** An assignment, seen from the side the user is on. */
export const accountExportAssignmentSchema = z.object({
  title: z.string(),
  /** The other person: the assignee for one the user created, the creator otherwise. */
  otherEmail: z.string(),
  state: z.string(),
  createdAt: timestamp,
  acceptedAt: optionalTimestamp,
  declinedAt: optionalTimestamp,
  lastCompletedAt: optionalTimestamp,
})

export const accountExportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: timestamp,
  account: z.object({
    email: z.string(),
    displayName: z.string().nullable(),
    timeZone: z.string(),
    emailLanguage: z.string(),
    createdAt: timestamp,
  }),
  reminders: z.array(accountExportReminderSchema),
  sharing: z.object({
    sharedWithMe: z.array(accountExportSharedWithMeSchema),
    /** Addresses offered as suggestions when the user shares a reminder. */
    recentRecipients: z.array(
      z.object({ email: z.string(), lastSharedAt: timestamp }),
    ),
  }),
  assignments: z.object({
    created: z.array(accountExportAssignmentSchema),
    received: z.array(accountExportAssignmentSchema),
  }),
  devices: z.object({
    passkeys: z.array(
      z.object({
        name: z.string().nullable(),
        backedUp: z.boolean(),
        createdAt: timestamp,
        lastUsedAt: optionalTimestamp,
      }),
    ),
    sessions: z.array(
      z.object({
        clientApp: z.string().nullable(),
        clientPlatform: z.string().nullable(),
        userAgent: z.string().nullable(),
        createdAt: timestamp,
        lastSeenAt: optionalTimestamp,
        expiresAt: timestamp,
        revokedAt: optionalTimestamp,
      }),
    ),
    pushRegistrations: z.array(
      z.object({
        kind: z.string(),
        locale: z.string(),
        userAgent: z.string().nullable(),
        createdAt: timestamp,
      }),
    ),
  }),
  dismissedAnnouncements: z.array(
    z.object({ announcementId: z.string(), dismissedAt: timestamp }),
  ),
})
export type AccountExport = z.infer<typeof accountExportSchema>
