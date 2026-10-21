/** Equal download choices for the same Android app, in the migration notice and Settings. */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import Button from '@mui/joy/Button'
import Stack from '@mui/joy/Stack'

export function AndroidDownloads() {
  useTranslation()
  return (
    <Stack spacing={1}>
      <Button component="a" variant="outlined" color="neutral" href="https://github.com/RyanEwen/persistent/releases/latest">{tr("Download APK from GitHub")}</Button>
      <Button component="a" variant="outlined" color="neutral" href="https://play.google.com/store/apps/details?id=ca.dynamicsolutions.persistent">{tr("Get it from Google Play")}</Button>
    </Stack>
  )
}
