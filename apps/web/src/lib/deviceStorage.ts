/**
 * Every browser storage key the web app uses, declared once (CONF-7, D-105), so
 * "reset this device" (CONF-4) can enumerate them and a new key cannot collide.
 *
 * All of them are device-scoped: account settings live in the database and none
 * has a per-device override. Existing keys keep their historical names, because
 * they hold users' current preferences and are renamed only with a read-old,
 * write-new migration. New keys are named `persistent.<area>.<name>`, with a
 * `.v<N>` suffix only when the stored shape changes.
 */

/** What a key holds, which decides whether "reset this device" clears it. */
export type DeviceStorageKind =
  /** A choice the user made on this device; reset clears it. */
  | 'preference'
  /** Sign-in identity or offline data; reset keeps it. */
  | 'session'
  /** A copy of server data that refills itself; reset keeps it. */
  | 'cache'

export interface DeviceStorageKey {
  key: string
  kind: DeviceStorageKind
  /** What the key holds, for readers of this file. */
  holds: string
}

/** Display, locale and sound preferences (`settings/useSettings.tsx`). */
export const SETTINGS_KEY = 'persistent-settings'
/** Joy UI's own colour-mode memory, written by its CssVarsProvider. */
export const JOY_MODE_KEY = 'joy-mode'
/** The saved identity that allows offline access (`auth/offlineSession.ts`). */
export const OFFLINE_SESSION_KEY = 'persistent-offline-session'
/** The persisted TanStack Query cache (`lib/persistQuery.ts`). */
export const QUERY_CACHE_KEY = 'persistent-query-cache'
/** The last fetched "Our other apps" catalog (`data/promotedApps.ts`). */
export const PROMOTED_APPS_CACHE_KEY = 'persistent-promoted-apps-v1'
/**
 * The native-apps banner was dismissed (`components/GetTheApp.tsx`). Deliberately
 * unversioned: dismissal means never show it again on this installation.
 */
export const APP_PROMO_DISMISSED_KEY = 'persistent-hide-native-apps-banner'
/** Which Android permission guides were already offered (`native/permissions`). */
export const PERMISSION_GUIDE_OFFERED_KEY =
  'persistent-permission-guide-offered'
/** The direct-build-to-Play notice was seen (`native/DirectBuildMigrationNotice.tsx`). */
export const PLAY_MIGRATION_NOTICE_SEEN_KEY =
  'persistent-play-migration-notice-seen'

/** Every key, with its kind. A key missing here is a bug: reset could not see it. */
export const DEVICE_STORAGE_KEYS: readonly DeviceStorageKey[] = [
  {
    key: SETTINGS_KEY,
    kind: 'preference',
    holds: 'theme, doodles, language, formats, sounds',
  },
  { key: JOY_MODE_KEY, kind: 'preference', holds: 'light or dark mode' },
  {
    key: APP_PROMO_DISMISSED_KEY,
    kind: 'preference',
    holds: 'banner dismissed',
  },
  {
    key: PERMISSION_GUIDE_OFFERED_KEY,
    kind: 'preference',
    holds: 'guides offered',
  },
  {
    key: PLAY_MIGRATION_NOTICE_SEEN_KEY,
    kind: 'preference',
    holds: 'notice seen',
  },
  { key: OFFLINE_SESSION_KEY, kind: 'session', holds: 'offline identity' },
  { key: QUERY_CACHE_KEY, kind: 'cache', holds: 'offline data' },
  { key: PROMOTED_APPS_CACHE_KEY, kind: 'cache', holds: 'app catalog' },
]
