/**
 * Live alarm-grant readiness for the native app: one shared value for every
 * reader (the banner, the first-run guide and any open guide dialog).
 *
 * Granting happens in system settings, so the app is backgrounded while it
 * changes and resume is the signal that the user came back. One resume listener
 * and one bridge read serve all readers, so they never disagree about a grant.
 */
import { useSyncExternalStore } from 'react'
import { App } from '@capacitor/app'
import { AlarmPlugin, isNative } from '../alarmBridge.js'
import { normalizeReadiness, type AlarmReadiness } from './alarmGrants.js'

let latest: AlarmReadiness | null = null
const listeners = new Set<() => void>()
let resumeListenerInstalled = false

/** One readiness read; null on the web or when the host can't answer. */
export async function readAlarmReadiness(): Promise<AlarmReadiness | null> {
  if (!isNative()) return null
  const raw = await AlarmPlugin.alarmReadiness().catch(() => null)
  return raw ? normalizeReadiness(raw) : null
}

/**
 * Re-read readiness and publish it to every reader. Returns the read (null when
 * it failed, in which case the previous value stays).
 */
export async function refreshAlarmReadiness(): Promise<AlarmReadiness | null> {
  const next = await readAlarmReadiness()
  if (next) {
    latest = next
    for (const listener of listeners) listener()
  }
  return next
}

/** Subscribe a reader. Each new reader triggers a fresh read, so a newly opened guide never acts on stale grants. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  // App-lifetime listener: installed once, on the first native reader.
  if (isNative() && !resumeListenerInstalled) {
    resumeListenerInstalled = true
    void App.addListener('resume', () => void refreshAlarmReadiness()).catch(() => {
      resumeListenerInstalled = false
    })
  }

  void refreshAlarmReadiness()
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Readiness, plus `refresh` for an explicit re-check (it also returns the read).
 * `readiness` is null until the first read, and always on the web.
 */
export function useAlarmReadiness(): { readiness: AlarmReadiness | null; refresh: () => Promise<AlarmReadiness | null> } {
  const readiness = useSyncExternalStore(subscribe, () => latest, () => null)
  return { readiness, refresh: refreshAlarmReadiness }
}
