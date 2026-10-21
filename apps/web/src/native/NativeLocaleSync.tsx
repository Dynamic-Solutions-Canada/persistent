/** Refresh device registration/projection after a resolved language change; existing alarm startup remains independent. */
import { useEffect } from 'react'
import { useSettings } from '../settings/useSettings.js'
import { useAuth } from '../auth/useAuth.js'
import { isNative } from './alarmBridge.js'
import { refreshPushLocale, syncAlarms } from './nativeSync.js'
import { NativePresentationSync } from './NativePresentationSync.js'

export function NativeLocaleSync() {
  const { locale, nativeLanguageReady } = useSettings()
  const { user, offline } = useAuth()
  useEffect(() => {
    if (!user?.id || offline || !isNative() || !nativeLanguageReady) return
    void (async () => {
      await refreshPushLocale()
      await syncAlarms()
    })().catch(() => {})
  }, [locale, user?.id, offline, nativeLanguageReady])
  return <NativePresentationSync />
}
