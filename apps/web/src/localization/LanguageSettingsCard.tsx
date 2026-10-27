/** Device presentation choices follow the existing Settings card and field conventions. */
import Card from '@mui/joy/Card'
import Typography from '@mui/joy/Typography'
import FormControl from '@mui/joy/FormControl'
import FormLabel from '@mui/joy/FormLabel'
import Select from '@mui/joy/Select'
import Option from '@mui/joy/Option'
import { localeNames, supportedLocales, type Locale } from '@persistent/shared'
import { useTranslation, Trans } from 'react-i18next'
import { useAuth } from '../auth/useAuth.js'
import { formatDateTime } from '../lib/datetime.js'
import { useSettings } from '../settings/useSettings.js'
import { LanguageSelect } from './LanguageSelect.js'
import { tr } from './i18n.js'

export function LanguageSettingsCard() {
  useTranslation()
  const { user } = useAuth()
  const {
    formattingLocaleOverride,
    formattingLocale,
    setFormattingLocaleOverride,
    timeFormat,
    timeFormatChosen,
    setTimeFormat,
    resetTimeFormat
  } = useSettings()
  const options = [...new Set<string>([...supportedLocales, formattingLocale])]
  return (
    <Card variant="outlined">
      <Typography level="title-sm">{tr('Language and region')}</Typography>
      <LanguageSelect />
      <FormControl>
        <FormLabel>{tr('Regional formatting')}</FormLabel>
        <Select value={formattingLocaleOverride ?? 'device'} onChange={(_event, value) => {
          if (value) setFormattingLocaleOverride(value === 'device' ? null : value)
        }}>
          <Option value="device">{tr('Match device')}</Option>
          {options.map((locale) => <Option key={locale} value={locale}>{localeNames[locale as Locale] ?? locale}</Option>)}
        </Select>
      </FormControl>
      <FormControl>
        <FormLabel>{tr("Time format")}</FormLabel>
        <Select value={timeFormatChosen ? timeFormat : 'device'} onChange={(_e, value) => {
          if (value === 'device') resetTimeFormat()
          else if (value === '12h' || value === '24h') setTimeFormat(value)
        }}>
          <Option value="device">{tr("Match device")}</Option>
          <Option value="12h">{tr("12-hour (1:30 PM)")}</Option>
          <Option value="24h">{tr("24-hour (13:30)")}</Option>
        </Select>
      </FormControl>
      <Typography level="body-xs"><Trans i18nKey={"Example: <v0/>"} components={{ v0: <>{formatDateTime(new Date(), timeFormat, user?.timeZone)}</> }} /></Typography>
      <Typography level="body-xs">{tr('These choices apply to this device. Regional formatting, time format, and your account time zone are separate.')}</Typography>
    </Card>
  )
}
