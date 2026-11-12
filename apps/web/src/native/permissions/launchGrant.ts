/**
 * Open the Android prompt or system screen that changes one alarm grant.
 *
 * Only call this after the user has read the grant's explanation and pressed
 * Continue: it is the single place the app leaves for system settings.
 */
import { PushNotifications } from '@capacitor/push-notifications'
import { AlarmPlugin } from '../alarmBridge.js'
import type { AlarmGrant, GrantRoute } from './alarmGrants.js'

/** Capacitor's explicit answer from a host built before a method existed. */
function isUnimplemented(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'UNIMPLEMENTED'
}

/**
 * Older hosts lack `openPermissionSettings`, but three grants have a request
 * method that opens the same screen. They can't say whether it opened, so assume
 * it did; the guide's Not now and Check again still let the user move on.
 */
async function launchOnOlderHost(grant: AlarmGrant): Promise<boolean> {
  switch (grant) {
    case 'overlay':
      await AlarmPlugin.requestOverlayPermission()
      return true
    case 'fullScreen':
      await AlarmPlugin.ensureFullScreenIntent()
      return true
    case 'battery':
      await AlarmPlugin.requestBatteryExemption()
      return true
    default:
      return false
  }
}

/**
 * Launch `grant` along `route`. Resolves with whether a prompt or screen opened;
 * false means the user must be shown where to find the setting by hand. Never
 * rejects.
 *
 * A runtime prompt resolves once answered (or at once, when Android has stopped
 * showing it); a settings screen resolves as soon as it starts. Either way the
 * outcome is read from readiness afterwards, not from this result.
 */
export async function launchGrant(grant: AlarmGrant, route: GrantRoute): Promise<boolean> {
  if (route === 'prompt') {
    await PushNotifications.requestPermissions().catch(() => {})
    return true
  }

  try {
    const { opened } = await AlarmPlugin.openPermissionSettings({ grant })
    return opened
  } catch (error) {
    if (!isUnimplemented(error)) return false
    return launchOnOlderHost(grant).catch(() => false)
  }
}
