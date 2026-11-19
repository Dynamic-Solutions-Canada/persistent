/** Update guidance for the About card, including the retired direct Android distribution. */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import Typography from '@mui/joy/Typography'
import { DirectBuildNotice } from './DirectBuildNotice.js'
import { hasNativeUpdater, isNative } from './alarmBridge.js'
import { AndroidDownloads } from './AndroidDownloads.js'

/** Choose update guidance by installed capabilities, keeping both Android download choices available. */
export function AppUpdateInformation() {
  useTranslation()
  if (hasNativeUpdater()) return <DirectBuildNotice />
  if (isNative()) {
    return (
      <>
        <Typography level="body-xs">
          {tr(
            'You can get updates through Google Play or install newer APKs from GitHub.',
          )}
        </Typography>
        <AndroidDownloads />
      </>
    )
  }
  return (
    <Typography level="body-xs">
      {tr('This web app updates automatically through your browser.')}
    </Typography>
  )
}
