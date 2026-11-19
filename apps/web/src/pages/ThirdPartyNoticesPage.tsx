/**
 * The third-party notices (HYG-3), shown inside the app so every host, including
 * the Android WebView, keeps its own navigation around them. The web app's text is
 * the generated `/THIRD-PARTY-NOTICES.txt` (devkit-notices), fetched as served. In
 * the Android app the shell's own notices, bundled in the APK, follow it; an older
 * shell without `readNotices` simply shows the web list.
 */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useEffect, useState } from 'react'
import Alert from '@mui/joy/Alert'
import Box from '@mui/joy/Box'
import Card from '@mui/joy/Card'
import CircularProgress from '@mui/joy/CircularProgress'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import { AlarmPlugin, isNative } from '../native/alarmBridge.js'

/** Where devkit-notices writes the web app's file; Vite serves `public/` at the root. */
const THIRD_PARTY_NOTICES_FILE = '/THIRD-PARTY-NOTICES.txt'

/** The Android shell's notices, or null off Android and on shells without `readNotices`. */
async function readAndroidNotices(): Promise<string | null> {
  if (!isNative()) return null
  try {
    return (await AlarmPlugin.readNotices()).text
  } catch {
    return null
  }
}

/** Monospace text on a card surface, readable over the doodle background. */
function NoticesText({ text }: { text: string }) {
  return (
    <Card variant="outlined">
      <Box
        component="pre"
        sx={{
          m: 0,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          fontSize: 'xs',
          fontFamily: 'code',
        }}
      >
        {text}
      </Box>
    </Card>
  )
}

type NoticesState =
  | { status: 'loading' }
  | { status: 'ready'; text: string; androidText: string | null }
  | { status: 'failed' }

export function ThirdPartyNoticesPage() {
  useTranslation()
  const [state, setState] = useState<NoticesState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    /** Fetch the static text file; it is not JSON, so `apiFetch` does not apply. */
    async function load(): Promise<void> {
      try {
        const response = await fetch(THIRD_PARTY_NOTICES_FILE, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const text = await response.text()
        setState({
          status: 'ready',
          text,
          androidText: await readAndroidNotices(),
        })
      } catch {
        if (!controller.signal.aborted) setState({ status: 'failed' })
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: 2, py: 4 }}>
      <Stack spacing={2}>
        <Typography level="h2">{tr('about.third-party-notices')}</Typography>
        {state.status === 'loading' && <CircularProgress size="sm" />}
        {state.status === 'failed' && (
          <Alert color="danger" variant="soft">
            {tr('about.notices-failed')}
          </Alert>
        )}
        {state.status === 'ready' && <NoticesText text={state.text} />}
        {state.status === 'ready' && state.androidText && (
          <NoticesText text={state.androidText} />
        )}
      </Stack>
    </Box>
  )
}
