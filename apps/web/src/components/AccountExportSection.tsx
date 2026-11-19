/**
 * Account settings section for "download my data" (SEC-13): a JSON copy of the
 * account, from GET /api/auth/me/export.
 *
 * Only a browser can save the file today. The Windows app opens Settings in the
 * system browser instead, and the Android and Linux apps, which cannot open their
 * own site in the browser yet, name the page to open. No session travels in any
 * link: the user signs in to the browser if it asks.
 */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useState } from 'react'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import Button from '@mui/joy/Button'
import Alert from '@mui/joy/Alert'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import { extractErrorMessage } from '../localization/errorMessage.js'
import { apiDownload } from '../lib/apiClient.js'
import { isNative } from '../native/alarmBridge.js'
import { desktopPlatform } from '../native/desktopBridge.js'

/** Where the download can happen on this surface. */
type ExportSurface = 'browser' | 'open-browser' | 'instructions'

/** Pick the surface: a browser saves files, Windows can hand off to one, others explain. */
function exportSurface(): ExportSurface {
  if (isNative()) return 'instructions'
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
  const surface = exportSurface()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <Stack spacing={1.5}>
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
            href="/settings"
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
