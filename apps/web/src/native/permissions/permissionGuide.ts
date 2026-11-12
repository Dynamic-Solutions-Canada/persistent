/**
 * Step selection for the permission guide: which grant to explain next and what
 * the dialog is waiting for. A pure reducer so the sequencing can be tested
 * without Android.
 *
 * Invariants:
 * - One grant at a time. Nothing is opened until the user presses Continue on
 *   that grant's explanation.
 * - Progress comes only from a fresh readiness read (on resume, after a prompt
 *   answers, or on Check again), never from the launch call resolving: settings
 *   screens are separate activities, so the launch resolves before the user acts.
 * - "Not now" always works, in every phase, and drops that grant from this guide
 *   only. A grant whose screen never opened can't trap the user waiting for a
 *   resume that will not come.
 */
import { missingGrants, type AlarmGrant, type AlarmReadiness, type GrantRoute } from './alarmGrants.js'

/**
 * - `explain`: why it is needed and what the next screen will ask; nothing opened yet.
 * - `waiting`: a system screen or prompt is open; the next readiness read decides.
 * - `stillOff`: the user came back and the grant is still off; offer to try again.
 * - `unavailable`: this device had no screen to open; show where to find it by hand.
 */
export type GuidePhase = 'explain' | 'waiting' | 'stillOff' | 'unavailable'

export interface GuideState {
  /** The grants this guide may ask for, fixed when it opens. */
  scope: readonly AlarmGrant[]
  /** Latest readiness, or null before the first read. */
  readiness: AlarmReadiness | null
  /** Grants the user chose Not now for during this guide. */
  declined: readonly AlarmGrant[]
  /** Grants whose runtime prompt has been tried, so the next attempt opens settings. */
  promptTried: readonly AlarmGrant[]
  /** The grant on screen, or null when nothing is left to ask (or before the first read). */
  current: AlarmGrant | null
  phase: GuidePhase
  /** Every grant that has been on screen, in order: what the user actually saw explained. */
  shown: readonly AlarmGrant[]
}

export type GuideEvent =
  | { type: 'readiness'; readiness: AlarmReadiness }
  | { type: 'launched'; grant: AlarmGrant; route: GrantRoute; opened: boolean }
  | { type: 'notNow' }

/** A guide over `scope` that has not read readiness yet. */
export function initialGuide(scope: readonly AlarmGrant[]): GuideState {
  return { scope, readiness: null, declined: [], promptTried: [], current: null, phase: 'explain', shown: [] }
}

/** The first grant still missing that the user hasn't put off, or null. */
function nextGrant(scope: readonly AlarmGrant[], readiness: AlarmReadiness, declined: readonly AlarmGrant[]): AlarmGrant | null {
  return missingGrants(readiness, scope).find((grant) => !declined.includes(grant)) ?? null
}

/** Put `current` on screen from its explanation, recording that it was shown. */
function showNext(state: GuideState, current: AlarmGrant | null): GuideState {
  const shown = current && !state.shown.includes(current) ? [...state.shown, current] : state.shown
  return { ...state, current, phase: 'explain', shown }
}

/** Whether the guide has read readiness and has nothing left to ask. */
export function isGuideFinished(state: GuideState): boolean {
  return state.readiness !== null && state.current === null
}

/**
 * Advance the guide.
 *
 * - `readiness`: a fresh read. A different first-missing grant (or none) starts
 *   its explanation; the same grant after a screen was open becomes `stillOff`.
 * - `launched`: a prompt or screen was (or could not be) opened for a grant. A
 *   result for a grant the user has already moved past is ignored.
 * - `notNow`: put off the grant on screen for this guide and show the next one.
 */
export function guideReducer(state: GuideState, event: GuideEvent): GuideState {
  switch (event.type) {
    case 'readiness': {
      const current = nextGrant(state.scope, event.readiness, state.declined)

      // A different grant (or none): the previous one was granted, so start the
      // next one from its explanation.
      if (current !== state.current) {
        return showNext({ ...state, readiness: event.readiness }, current)
      }

      // Same grant after a screen was open: the user came back without turning it on.
      const phase = state.phase === 'waiting' ? 'stillOff' : state.phase
      return { ...state, readiness: event.readiness, phase }
    }

    case 'launched': {
      // A late result for a grant the user has already moved past.
      if (event.grant !== state.current) return state

      const promptTried =
        event.route === 'prompt' && !state.promptTried.includes(event.grant)
          ? [...state.promptTried, event.grant]
          : state.promptTried
      return { ...state, promptTried, phase: event.opened ? 'waiting' : 'unavailable' }
    }

    case 'notNow': {
      if (!state.current || !state.readiness) return state

      const declined = [...state.declined, state.current]
      return showNext({ ...state, declined }, nextGrant(state.scope, state.readiness, declined))
    }
  }
}
