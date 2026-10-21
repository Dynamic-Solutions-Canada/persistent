/**
 * Windows notification controls shown only inside the desktop host.
 *
 * The durations come from the host, not from `SNOOZE_PRESETS`: Windows caps a
 * toast's picker at five items, so offering the app's full seven here would let the
 * user pick one the notification can never start on. See `SnoozeChoiceOption`.
 */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../../localization/i18n.js'
import Card from '@mui/joy/Card'
import Typography from '@mui/joy/Typography'
import Switch from '@mui/joy/Switch'
import Select from '@mui/joy/Select'
import Option from '@mui/joy/Option'
import FormControl from '@mui/joy/FormControl'
import FormLabel from '@mui/joy/FormLabel'
import FormHelperText from '@mui/joy/FormHelperText'
import type { HostSettingsProps } from './types.js'

export function DesktopNotificationsCard({ settings, update }: HostSettingsProps) {
  useTranslation()
  const linux = settings.platform === 'linux'
  return (
    <Card variant="outlined">
      <Typography level="title-sm">{linux ? tr("Linux notifications") : tr("Windows notifications")}</Typography>
      <FormControl orientation="horizontal" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <FormLabel>{tr("Persistent notifications on this PC")}</FormLabel>
        <Switch checked={settings.notifications} onChange={(e) => update({ notifications: e.target.checked })} />
      </FormControl>
      <Typography level="body-xs"><Trans i18nKey={"Keeps each reminder visible and brings it back if dismissed. Alarm reminders loop <v0/>; escalations can be de-escalated without marking them done. This works while the PC is awake and Persistent is running, and catches up after reconnecting. It cannot wake a sleeping or shut-down PC. Android can sound alarms even without an internet connection."} components={{ v0: <>{tr(linux ? 'the app alarm sound' : 'the Windows alarm sound')}</> }} /></Typography>
      {linux && (
        <Typography level="body-xs">{tr("Your desktop controls notification layout, sounds and Do Not Disturb. GNOME needs AppIndicator support for the tray icon. Snooze opens the app's full picker.")}</Typography>
      )}
      {/* The duration only means anything while the notifications are on, so it
          follows the toggle rather than sitting there looking editable. */}
      {settings.notifications && !settings.snoozeInApp && (
        <FormControl>
          <FormLabel>{tr("Snooze starts on")}</FormLabel>
          <Select
            value={settings.snoozeMinutes}
            onChange={(_e, value) => value !== null && update({ snoozeMinutes: value })}
          >
            {settings.snoozeChoices.map((choice) => (
              <Option key={choice.minutes} value={choice.minutes}>
                {choice.label}
              </Option>
            ))}
          </Select>
          <FormHelperText>{tr("Which duration the notification's snooze picker starts on. Windows allows it five, so Snooze inside the app offers more.")}</FormHelperText>
        </FormControl>
      )}
    </Card>
  )
}
