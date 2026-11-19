/**
 * Account settings section for "download my data" (SEC-13): a JSON copy of the
 * account, from GET /api/auth/me/export.
 *
 * Only a browser can save the file. The Windows app hands a link to the default
 * browser, and the Android app asks its host to open the page there
 * (`AlarmPlugin.openInBrowser`); an older Android app without that method, and the
 * Linux app, name the page to open instead. No session travels in any link: the
 * user signs in to the browser if it asks. The link lands on this section through
 * its `#export` anchor.
 */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useEffect, useRef, useState } from 'react'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import Button from '@mui/joy/Button'
import Alert from '@mui/joy/Alert'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import { extractErrorMessage } from '../localization/errorMessage.js'
import { apiDownload } from '../lib/apiClient.js'
import { AlarmPlugin, isNative } from '../native/alarmBridge.js'
import { desktopPlatform } from '../native/desktopBridge.js'

/** This section's anchor, so a link from a native app lands on it. */
const EXPORT_ANCHOR = 'export'
/** The page a native app opens in the browser: Settings, scrolled to this section. */
const EXPORT_PAGE_PATH = `/settings#${EXPORT_ANCHOR}`

/** Where the download can happen on this surface. */
type ExportSurface =
  'browser' | 'open-browser' | 'android-browser' | 'instructions'

/** Pick the surface: a browser saves files, Windows and Android hand off to one, Linux explains. */
function exportSurface(): ExportSurface {
  if (isNative()) return 'android-browser'
  const desktop = desktopPlatform()
  if (desktop === 'linux') return 'instructions'
  if (desktop === 'windows') return 'open-browser'
  return 'browser'
}

/** Save a downloaded blob under its file name through a temporary link. */
function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // Revoke after the click has been handled, so the browser has started the save.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function AccountExportSection() {
  useTranslation()
  const [surface, setSurface] = useState<ExportSurface>(exportSurface)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const section = useRef<HTMLDivElement>(null)

  // A native app's link opens Settings at #export; bring this section into view.
  useEffect(() => {
    if (window.location.hash === `#${EXPORT_ANCHOR}`) {
      section.current?.scrollIntoView({ block: 'center' })
    }
  }, [])

  /**
   * Ask the Android host to open this section in the system browser. An older app
   * without `openInBrowser` (or a refusal) falls back to the instruction line.
   */
  async function onOpenInBrowser() {
    try {
      await AlarmPlugin.openInBrowser({
        url: `${window.location.origin}${EXPORT_PAGE_PATH}`,
      })
    } catch {
      setSurface('instructions')
    }
  }

  async function onDownload() {
    setBusy(true)
    setError(null)
    try {
      const { blob, fileName } = await apiDownload('/api/auth/me/export')
      saveFile(blob, fileName ?? 'persistent-export.json')
    } catch (err) {
      setError(extractErrorMessage(err, tr('account.export.failed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={1.5} ref={section} id={EXPORT_ANCHOR}>
      <Typography level="title-sm">{tr('account.export.title')}</Typography>
      <Typography level="body-sm">
        {tr('account.export.description')}
      </Typography>

      {surface === 'browser' && (
        <Button
          variant="outlined"
          startDecorator={<DownloadRoundedIcon />}
          loading={busy}
          onClick={() => void onDownload()}
          sx={{ alignSelf: 'flex-start' }}
        >
          {tr('account.export.download')}
        </Button>
      )}

      {/* The Windows host sends a target=_blank link to the default browser. */}
      {surface === 'open-browser' && (
        <>
          <Typography level="body-sm">
            {tr('account.export.browser-note')}
          </Typography>
          <Button
            component="a"
            href={EXPORT_PAGE_PATH}
            target="_blank"
            rel="noopener"
            variant="outlined"
            startDecorator={<OpenInNewRoundedIcon />}
            sx={{ alignSelf: 'flex-start' }}
          >
            {tr('account.export.open-browser')}
          </Button>
        </>
      )}

      {surface === 'android-browser' && (
        <>
          <Typography level="body-sm">
            {tr('account.export.browser-note')}
          </Typography>
          <Button
            variant="outlined"
            startDecorator={<OpenInNewRoundedIcon />}
            onClick={() => void onOpenInBrowser()}
            sx={{ alignSelf: 'flex-start' }}
          >
            {tr('account.export.open-browser')}
          </Button>
        </>
      )}

      {surface === 'instructions' && (
        <Typography level="body-sm">
          {tr('account.export.instructions', { site: window.location.host })}
        </Typography>
      )}

      {error && (
        <Alert color="danger" variant="soft">
          {error}
        </Alert>
      )}
    </Stack>
  )
}
