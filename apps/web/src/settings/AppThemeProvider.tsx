/** Applies the saved device theme globally, including menus, dialogs, and toasts. */
import { useLayoutEffect, useMemo, type ReactNode } from 'react'
import { CssVarsProvider, useColorScheme } from '@mui/joy/styles'
import CssBaseline from '@mui/joy/CssBaseline'
import GlobalStyles from '@mui/joy/GlobalStyles'
import { createAppTheme } from '../theme.js'
import { getTheme, type AppTheme } from './themes.js'
import { useSettings } from './useSettings.js'
import { NativeAppearanceSync } from '../native/NativeAppearanceSync.js'

/** The saved app choice controls whether Joy follows the system or stays fixed. */
function SelectedColorScheme({ mode }: { mode: AppTheme['mode'] | 'system' }) {
  const { setMode } = useColorScheme()
  useLayoutEffect(() => {
    setMode(mode)
  }, [mode, setMode])
  return null
}

/** Keep the provider mounted so changing appearance preserves dialogs and drafts. */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { themeId } = useSettings()
  // The system option supplies both Enjoy palettes; Joy follows the OS.
  const selected = getTheme(themeId, 'dark')
  const mode = themeId === 'system' ? 'system' : selected.mode
  const theme = useMemo(() => createAppTheme(selected), [selected])

  return (
    <CssVarsProvider theme={theme} defaultMode={mode} disableTransitionOnChange>
      <SelectedColorScheme mode={mode} />
      <NativeAppearanceSync />
      <CssBaseline />
      {/* Scale all rem-based typography up 10% overall. Japanese wraps between
          phrases rather than at any character, so a line never ends with a word
          cut in two or leaves "す。" alone (Chromium's auto-phrase; the root's
          lang comes from configureLocale). Other browsers keep normal breaking. */}
      <GlobalStyles
        styles={{
          html: { fontSize: '110%' },
          ':lang(ja)': { wordBreak: 'auto-phrase' },
        }}
      />
      {children}
    </CssVarsProvider>
  )
}
