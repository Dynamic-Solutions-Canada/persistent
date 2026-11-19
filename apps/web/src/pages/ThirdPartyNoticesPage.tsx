/**
 * The third-party notices (HYG-3), shown inside the app so every host, including
 * the Android WebView, keeps its own navigation around them. The text itself is
 * the generated `/THIRD-PARTY-NOTICES.txt` (devkit-notices), fetched as served.
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

/** Where devkit-notices writes the web app's file; Vite serves `public/` at the root. */
const THIRD_PARTY_NOTICES_FILE = '/THIRD-PARTY-NOTICES.txt'

type NoticesState =
  | { status: 'loading' }
  | { status: 'ready'; text: string }
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
        setState({ status: 'ready', text: await response.text() })
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
        {/* A card surface keeps the long text readable over the doodle background. */}
        {state.status === 'ready' && (
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
              {state.text}
            </Box>
          </Card>
        )}
      </Stack>
    </Box>
  )
}
