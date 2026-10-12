/** Host-specific content and destinations for the native-app promotion banner. */
import { LINUX_RELEASES_URL } from '@persistent/shared'

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=ca.dynamicsolutions.persistent'
// GitHub release search matches the published title, not the linux-v tag prefix.
export const LINUX_DOWNLOADS_URL = `${LINUX_RELEASES_URL}?q=Linux&expanded=true`
export const WINDOWS_STORE_URL = 'https://apps.microsoft.com/detail/9PCX2XGQ7CJS'

// This key is deliberately unversioned: dismissal means never show this promo
// again on this installation, including after app and service-worker updates.
export const APP_PROMO_DISMISSED_KEY = 'persistent-hide-native-apps-banner'

export type NativeAppsPromoHost = 'android' | 'windows' | 'linux' | 'web'

export interface NativeAppsPromotion {
  title: string
  description: string
  showAndroid: boolean
  showWindows: boolean
  showLinux: boolean
}

/** Describe the useful companion app or apps without promoting the current host. */
export function getNativeAppsPromotion(host: NativeAppsPromoHost): NativeAppsPromotion {
  if (host === 'android') {
    return {
      title: 'Persistent is available for Windows and Linux',
      description:
        'Keep reminders in your system tray and get persistent notifications and alarm audio while your computer is awake. Windows also offers an upcoming widget.',
      showAndroid: false,
      showWindows: true,
      showLinux: true
    }
  }

  if (host === 'windows' || host === 'linux') {
    return {
      title: 'Get reliable alarms on Android',
      description: 'The Android app provides reliable, undismissable alarms that can reach you even offline.',
      showAndroid: true,
      showWindows: false,
      showLinux: false
    }
  }

  return {
    title: 'Persistent on Android, Windows and Linux',
    description:
      'Android can sound alarms even while offline. The Windows and Linux apps add tray access and persistent alerts while your computer is awake. Windows also offers an upcoming widget.',
    showAndroid: true,
    showWindows: true,
    showLinux: true
  }
}
