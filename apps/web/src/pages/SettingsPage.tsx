/**
 * Settings for appearance, native notifications, account access and sign-out.
 * Browser notifications are deliberately unsupported; Android, Windows and Linux each
 * render their own device-specific controls here.
 *
 * Every host adds its own cards here rather than putting them somewhere of its
 * own: Android's sounds and shade prominence, and the desktop tray apps'
 * notifications, startup and window settings (`native/desktop-settings/`). One
 * Settings screen per product, whichever host is showing it.
 */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { Link as RouterLink } from 'react-router-dom'
import Stack from '@mui/joy/Stack'
import Card from '@mui/joy/Card'
import Box from '@mui/joy/Box'
import Typography from '@mui/joy/Typography'
import Button from '@mui/joy/Button'
import Link from '@mui/joy/Link'
import Select from '@mui/joy/Select'
import Option from '@mui/joy/Option'
import FormControl from '@mui/joy/FormControl'
import FormLabel from '@mui/joy/FormLabel'
import { useAuth } from '../auth/useAuth.js'
import { LanguageSettingsCard } from '../localization/LanguageSettingsCard.js'
import { useSettings, type SoundChoice } from '../settings/useSettings.js'
import { doodleColorOptions, type DoodleColorId } from '../settings/doodleColors.js'
import { useAppTheme } from '../settings/useAppTheme.js'
import { THEME_OPTIONS } from '../settings/themes.js'
import { SectionHeading } from '../components/SectionHeading.js'
import { SoundPickerRow } from '../components/SoundPickerRow.js'
import { AlarmPlugin, isNative, pickSound } from '../native/alarmBridge.js'
import { mirrorSyncConfig } from '../native/nativeSync.js'
import { DesktopSettings } from '../native/desktop-settings/DesktopSettings.js'
import { UpdateSettings } from '../native/UpdateSettings.js'
import { AccountSettingsCard } from '../components/AccountSettingsCard.js'
import { NativeAppButtons } from '../components/NativeAppButtons.js'

export function SettingsPage() {
  useTranslation()
  const { user } = useAuth()
  const {
    themeId,
    setThemeId,
    doodles,
    setDoodles,
    doodleColor,
    setDoodleColor,
    alarmSound,
    notificationSound,
    nagSound,
    setAlarmSound,
    setNotificationSound,
    setNagSound,
    shadeProminence,
    setShadeProminence
  } = useSettings()

  const theme = useAppTheme()
  const doodleColors = doodleColorOptions(theme)
  const doodleBackgroundOptions = [
    ...doodleColors.slice(0, 1),
    { id: 'none' as const, name: 'No doodles', color: null },
    ...doodleColors.slice(1)
  ]

  async function chooseSound(type: 'alarm' | 'notification', current: SoundChoice, apply: (s: SoundChoice) => void) {
    const picked = await pickSound(type, current.uri)
    if (!picked) return
    apply(picked)
    // Push it to native now rather than at the next resync, so a tone chosen and
    // immediately tested is the one that rings.
    void mirrorSyncConfig().catch(() => {})
  }

  function changeShadeProminence(value: 'NORMAL' | 'MINIMIZED') {
    setShadeProminence(value)
    // Update the native default + re-post any live notifications immediately.
    void AlarmPlugin.setDefaultShadeProminence({ minimized: value === 'MINIMIZED' }).catch(() => {})
  }
  return (
    <Stack spacing={1.5}>
      <SectionHeading
        title={tr("Settings")}
        subtitle={tr("Appearance, sounds, notifications, and account")}
      />

      {user?.isAdmin && (
        <Button component={RouterLink} to="/admin" variant="outlined">{tr("Administration")}</Button>
      )}

      <LanguageSettingsCard />

      <Card variant="outlined">
        <Typography level="title-sm">{tr("Appearance")}</Typography>
        <FormControl>
          <FormLabel>{tr("Theme")}</FormLabel>
          <Select value={themeId} onChange={(_e, value) => value && setThemeId(value)}>
            {THEME_OPTIONS.map((t) => (
              <Option key={t.id} value={t.id}>
                {tr(t.name)}
              </Option>
            ))}
          </Select>
        </FormControl>
        <Typography level="body-xs">{tr("Match system automatically follows your device's light or dark appearance.")}</Typography>
        <FormControl>
          <FormLabel>{tr("Doodle background")}</FormLabel>
          <Select<DoodleColorId | 'none'>
            value={doodles ? doodleColor : 'none'}
            onChange={(_event, value) => {
              if (!value) return

              if (value === 'none') {
                setDoodles(false)
              } else {
                setDoodleColor(value)
                setDoodles(true)
              }
            }}
          >
            {doodleBackgroundOptions.map((option) => (
              <Option key={option.id} value={option.id} label={tr(option.name)} sx={{ gap: 1 }}>
                {option.color && (
                  <Box
                    aria-hidden="true"
                    sx={{ width: 14, height: 14, flexShrink: 0, borderRadius: '50%', bgcolor: option.color, border: '1px solid', borderColor: 'neutral.outlinedBorder' }}
                  />
                )}
                {tr(option.name)}
              </Option>
            ))}
          </Select>
        </FormControl>
        <Typography level="body-xs">{tr("Choose the doodle line color. Light themes use pale colors; darker themes use dark colors.")}</Typography>
      </Card>

      <Card variant="outlined">
        <Typography level="title-sm">{tr("Sounds")}</Typography>
        {isNative() ? (
          <Stack spacing={1.5}>
            <SoundPickerRow
              label={tr("Notification sound")}
              value={notificationSound.uri ? notificationSound.title : tr('Default')}
              onChoose={() => void chooseSound('notification', notificationSound, setNotificationSound)}
            />
            <SoundPickerRow
              label={tr("Nag sound")}
              value={nagSound.uri ? nagSound.title : tr('Same as notification ({{title}})', { title: notificationSound.uri ? notificationSound.title : tr('Default') })}
              onChoose={() => void chooseSound('notification', nagSound, setNagSound)}
            />
            <Typography level="body-xs">{tr("The notification sound plays the first time a reminder notifies you; the nag sound plays on each repeat after that, for reminders with a nag interval set. Alarms ring one continuous tone, so this doesn't apply to them.")}</Typography>
            <SoundPickerRow
              label={tr("Alarm sound")}
              value={alarmSound.uri ? alarmSound.title : tr('Default')}
              onChoose={() => void chooseSound('alarm', alarmSound, setAlarmSound)}
            />
            <Typography level="body-xs">{tr("These are this device's tones. A single reminder can override them on its Notifications tab.")}</Typography>
          </Stack>
        ) : (
          <Typography level="body-sm">{tr("Choosing sounds is available in the Android app.")}</Typography>
        )}
      </Card>

      {isNative() && (
        <Card variant="outlined">
          <Typography level="title-sm">{tr("Notification shade")}</Typography>
          <FormControl>
            <FormLabel>{tr("Default prominence")}</FormLabel>
            <Select value={shadeProminence} onChange={(_e, value) => value && changeShadeProminence(value)}>
              <Option value="NORMAL">{tr("Normal")}</Option>
              <Option value="MINIMIZED">{tr("Minimized")}</Option>
            </Select>
          </FormControl>
          <Typography level="body-xs">{tr("Where reminders sit in the Android notification shade by default. Minimized tucks them into the collapsed section at the bottom with no pop-up banner. This is visual only, it doesn't change the sound, and a reminder can override it. Escalations always stay prominent.")}</Typography>
        </Card>
      )}

      {/* Desktop host settings render only in the Windows and Linux apps. */}
      <DesktopSettings />

      <AccountSettingsCard />

      <Card variant="outlined">
        <Typography level="title-sm">{tr("Help")}</Typography>
        <Typography level="body-sm"><Trans i18nKey={"New here, or want a refresher on how nagging, escalation, and Done/De-escalate/Snooze work? <c0>How Persistent works</c0>"} components={{ c0: <Link component={RouterLink} to="/help" /> }} /></Typography>
      </Card>

      <Card variant="outlined">
        <Typography level="title-sm">{tr("Privacy")}</Typography>
        <Typography level="body-sm"><Trans i18nKey={"What Persistent stores and who it's shared with: <c0>Privacy policy</c0> · <c1>Deleting your account</c1>"} components={{ c0: <Link component={RouterLink} to="/privacy" />, c1: <Link component={RouterLink} to="/delete-account" /> }} /></Typography>
      </Card>

      <UpdateSettings />

      <Card variant="outlined">
        <Typography level="title-sm">{tr("Apps")}</Typography>
        <Typography level="body-sm">{tr("Get alarms that work offline on Android, or persistent alerts while your computer is awake with the Windows and Linux apps.")}</Typography>
        <NativeAppButtons />
        <Link component={RouterLink} to="/settings/apps">{tr("Our other apps")}</Link>
      </Card>
    </Stack>
  )
}
