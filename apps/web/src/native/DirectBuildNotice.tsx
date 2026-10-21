/** Migration guidance shared by the direct-build launch notice and Settings. */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import Typography from '@mui/joy/Typography'
import { AndroidDownloads } from './AndroidDownloads.js'

export function DirectBuildNotice() {
  useTranslation()
  return (
    <>
      <Typography level="body-sm">{tr("You do not need to use the Google Play Store. You can still download and install the APK manually from GitHub.")}</Typography>
      <Typography level="body-sm">{tr("Previously, GitHub and Google Play had separate Android apps. Now both offer the same app. Think of the new APK as having a different ID card: Android installs it beside this old app instead of replacing it.")}</Typography>
      <Typography level="body-sm">{tr("Install the new app from either place and sign in to the same account. Check your saved reminders there, then uninstall this old app to avoid duplicate alerts. The new app does not support Android Auto.")}</Typography>
      <Typography level="body-sm">{tr("If you prefer manual updates, download future APKs from GitHub. The new app does not download APK updates itself.")}</Typography>
      <AndroidDownloads />
    </>
  )
}
