/**
 * The Android grants a fired alarm depends on, with the words the app uses to
 * explain each one before sending the user to the system screen that changes it.
 *
 * Pure data and helpers, free of Capacitor, so the guide's step selection can be
 * tested and recomputed from a fresh readiness read at any time (including after
 * Android killed the app while the user was in settings).
 *
 * Invariant: a grant counts as missing only when the host reports it `false`.
 * The hosted web bundle reaches installed Android wrappers before any new APK,
 * so an older host that doesn't report a grant must read as "unknown", never as
 * a gap to nag about.
 */

/** Readiness keys, as `AlarmPlugin.alarmReadiness()` reports them. */
export type AlarmGrant = 'notifications' | 'exactAlarms' | 'fullScreen' | 'overlay' | 'battery'

/** What the host reported per grant; `undefined` means this host doesn't report it. */
export type AlarmReadiness = Record<AlarmGrant, boolean | undefined>

/**
 * How the user changes a grant. `prompt` is Android's own runtime dialog, which
 * stops appearing after repeated denials, so a grant that has one also falls back
 * to its settings screen.
 */
export type GrantRoute = 'prompt' | 'settings'

/** Everything the app says about one grant. All strings are English catalog keys for `tr()`. */
export interface AlarmGrantCopy {
  grant: AlarmGrant
  /** The action, phrased as a button label and dialog title. */
  title: string
  /**
   * `critical` gaps hide or delay a ringing alarm; `reliability` gaps only make
   * background behavior less dependable. The banner is softer when only the latter
   * remain, since a user may reasonably decline them.
   */
  severity: 'critical' | 'reliability'
  /** What breaks without it: concrete, shown in the banner. */
  consequence: string
  /** Why Persistent needs it, shown before anything opens. */
  why: string
  /** What the user will see and what to choose there, per route. */
  instructions: Partial<Record<GrantRoute, string>>
  /** Where to find it by hand when this device can't open the screen for us. */
  manualPath: string
}

/** In the order the guide asks: the grant whose absence hides an alarm comes first. */
export const ALARM_GRANTS: readonly AlarmGrantCopy[] = [
  {
    grant: 'notifications',
    severity: 'critical',
    title: 'Turn on notifications',
    consequence: 'Alarms will sound with nothing on screen to identify or stop them.',
    why: 'Every reminder appears as a notification, and a ringing alarm needs one so you can see what it is and stop it.',
    instructions: {
      prompt: 'Android may ask whether Persistent can send notifications. If it does, choose Allow.',
      settings: 'On the next screen, turn on notifications for Persistent.'
    },
    manualPath: 'Settings > Apps > Persistent > Notifications'
  },
  {
    grant: 'exactAlarms',
    severity: 'critical',
    title: 'Allow exact alarms',
    consequence: 'Reminders may notify you late, batched by the system instead of at the time you set.',
    why: 'This lets reminders fire at the minute you set. Without it, Android may hold them back to save battery.',
    instructions: {
      settings: 'On the next screen, turn on Allow setting alarms and reminders.'
    },
    manualPath: 'Settings > Apps > Persistent > Alarms & reminders'
  },
  {
    grant: 'fullScreen',
    severity: 'critical',
    title: 'Allow full-screen notifications',
    consequence: "Alarms won't cover the lock screen, so a ringing alarm may be missed.",
    why: 'This lets a ringing alarm cover the lock screen, so you notice it even when the phone is locked.',
    instructions: {
      settings: 'On the next screen, turn on Allow full-screen notifications.'
    },
    manualPath: 'Settings > Apps > Special app access > Full-screen notifications'
  },
  {
    grant: 'overlay',
    severity: 'critical',
    title: 'Allow display over other apps',
    consequence: "Alarms can't take over the screen while you're using the phone, they collapse into a banner.",
    why: 'Android requires this before a ringing alarm can take over the screen while you are using your phone. Persistent does not draw over other apps.',
    instructions: {
      settings: 'On the next screen, find Persistent if asked, then turn on Allow display over other apps.'
    },
    manualPath: 'Settings > Apps > Special app access > Display over other apps'
  },
  {
    grant: 'battery',
    severity: 'reliability',
    title: 'Let Persistent run in the background',
    consequence: 'Battery saving may delay reminder updates, and some phones may stop Persistent in the background.',
    why: "This stops Android's battery saving from putting Persistent to sleep, so reminders stay up to date and keep working on phones that close background apps.",
    instructions: {
      settings: 'Android will ask whether Persistent can run in the background. Choose Allow.'
    },
    manualPath: 'Settings > Apps > Persistent > Battery > Unrestricted'
  }
]

/** The copy for one grant. */
export function grantCopy(grant: AlarmGrant): AlarmGrantCopy {
  return ALARM_GRANTS.find((entry) => entry.grant === grant)!
}

/**
 * Normalize a raw `alarmReadiness()` result. Only real booleans survive; anything
 * else (a field an older host doesn't send, or a malformed reply) becomes
 * `undefined`, which every caller treats as "not known to be missing".
 */
export function normalizeReadiness(raw: unknown): AlarmReadiness {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const read = (grant: AlarmGrant) => (typeof source[grant] === 'boolean' ? (source[grant] as boolean) : undefined)
  return {
    notifications: read('notifications'),
    exactAlarms: read('exactAlarms'),
    fullScreen: read('fullScreen'),
    overlay: read('overlay'),
    battery: read('battery')
  }
}

/**
 * The grants among `among` that the host reports as missing, in the order the
 * guide asks for them. Unknown grants are never included.
 */
export function missingGrants(readiness: AlarmReadiness, among: readonly AlarmGrant[]): AlarmGrant[] {
  return ALARM_GRANTS.map((entry) => entry.grant).filter((grant) => among.includes(grant) && readiness[grant] === false)
}

/** Whether no grant at all is reported missing (unknown grants don't count). */
export function isFullySetUp(readiness: AlarmReadiness): boolean {
  return missingGrants(readiness, ALARM_GRANTS.map((entry) => entry.grant)).length === 0
}

/**
 * Which route to offer for a grant. A grant with a runtime prompt uses it first;
 * once the prompt has been tried and the grant is still off, Android has likely
 * stopped showing it, so the settings screen is the only way left.
 */
export function routeFor(grant: AlarmGrant, promptTried: boolean): GrantRoute {
  const copy = grantCopy(grant)
  return copy.instructions.prompt && !promptTried ? 'prompt' : 'settings'
}
