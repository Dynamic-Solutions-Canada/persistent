/** Display mirroring works while signed out, independently of alarm and account readiness. */
import { useEffect, useMemo } from 'react'
import type { NativeLocale } from '@persistent/shared'
import { useSettings } from '../settings/useSettings.js'
import { AlarmPlugin, isNative } from './alarmBridge.js'
import { publishDesktopLocale } from './desktopBridge.js'

/** Presentation syncing also works while signed out, independently of alarm/auth readiness. */
export function NativePresentationSync({ nativeBridge = isNative() ? AlarmPlugin : null }: {
  nativeBridge?: { setLocale(options: { locale: NativeLocale }): Promise<void> } | null
}) {
  const { locale, formattingLocale, languageOverride, formattingLocaleOverride, timeFormat, timeFormatChosen, nativeLanguageReady } = useSettings()
  const presentation = useMemo<NativeLocale>(() => ({
    version: 1, resolvedLocale: locale, formattingLocale, languageOverride,
    formattingLocaleOverride, timeFormat, timeFormatChosen
  }), [locale, formattingLocale, languageOverride, formattingLocaleOverride, timeFormat, timeFormatChosen])

  useEffect(() => {
    if (!nativeLanguageReady) return
    publishDesktopLocale(presentation)
    if (!nativeBridge) return
    void nativeBridge.setLocale({ locale: presentation }).catch((error: unknown) => {
      // New hosted bundles remain usable in wrappers that predate this display-only bridge.
      console.warn('Native language could not be synchronized.', error)
    })
  }, [presentation, nativeLanguageReady, nativeBridge])
  return null
}
