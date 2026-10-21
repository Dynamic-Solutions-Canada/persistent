/** The same device language picker on sign-in and Settings; it never changes account email language. */
import FormControl from '@mui/joy/FormControl'
import FormLabel from '@mui/joy/FormLabel'
import Select from '@mui/joy/Select'
import Option from '@mui/joy/Option'
import { localeNames, supportedLocales, type Locale } from '@persistent/shared'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../settings/useSettings.js'
import { tr } from './i18n.js'

export function LanguageSelect() {
  useTranslation()
  const { languageOverride, setLanguageOverride } = useSettings()
  return (
    <FormControl>
      <FormLabel>{tr('Interface language')}</FormLabel>
      <Select<Locale | 'device'> value={languageOverride ?? 'device'} onChange={(_event, value) => {
        if (value) setLanguageOverride(value === 'device' ? null : value)
      }}>
        <Option value="device">{tr('Match device')}</Option>
        {supportedLocales.map((locale) => <Option key={locale} value={locale}>{localeNames[locale]}</Option>)}
      </Select>
    </FormControl>
  )
}
