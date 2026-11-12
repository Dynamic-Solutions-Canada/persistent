/**
 * Which alarm grants the first-run guide has already offered on this device.
 *
 * The guide walks through what is missing once. A grant the user put off is not
 * offered again on later launches (the banner keeps it visible instead); only a
 * grant this device has never been offered brings the guide back. Per device,
 * like the other device preferences, because grants belong to the installation.
 */
import { ALARM_GRANTS, missingGrants, type AlarmGrant, type AlarmReadiness } from './alarmGrants.js'

const OFFERED_KEY = 'persistent-permission-guide-offered'

/** Grants offered before; empty when storage is unavailable or unreadable. */
export function readOfferedGrants(): AlarmGrant[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OFFERED_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    const known = ALARM_GRANTS.map((entry) => entry.grant)
    return parsed.filter((value): value is AlarmGrant => known.includes(value as AlarmGrant))
  } catch {
    return []
  }
}

/** Remember that `grants` were offered, keeping earlier ones. */
export function recordOfferedGrants(grants: readonly AlarmGrant[]): void {
  const offered = new Set([...readOfferedGrants(), ...grants])
  try {
    localStorage.setItem(OFFERED_KEY, JSON.stringify([...offered]))
  } catch {
    // Storage may be unavailable; the guide may then return next launch, which is harmless.
  }
}

/** The missing grants the guide should offer now: those never offered on this device. */
export function grantsToOffer(readiness: AlarmReadiness, offered: readonly AlarmGrant[]): AlarmGrant[] {
  return missingGrants(readiness, ALARM_GRANTS.map((entry) => entry.grant)).filter((grant) => !offered.includes(grant))
}
