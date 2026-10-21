/** Explicit account email language, separate from the device's interface language. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import FormControl from '@mui/joy/FormControl'
import FormLabel from '@mui/joy/FormLabel'
import FormHelperText from '@mui/joy/FormHelperText'
import Select from '@mui/joy/Select'
import Option from '@mui/joy/Option'
import { localeNames, supportedLocales } from '@persistent/shared'
import { extractErrorMessage } from './errorMessage.js'
import { useAuth } from '../auth/useAuth.js'
import { apiFetch } from '../lib/apiClient.js'
import { notify } from '../lib/toast.js'
import { tr } from './i18n.js'

export function EmailLanguageSelect() {
  useTranslation()
  const { user, offline, refreshSession } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <FormControl>
      <FormLabel>{tr('Email language')}</FormLabel>
      <Select value={user?.emailLanguage ?? 'en-US'} disabled={offline || busy} onChange={async (_event, emailLanguage) => {
        if (!emailLanguage) return
        setBusy(true)
        try {
          await apiFetch('/api/auth/preferences', { method: 'PATCH', body: JSON.stringify({ emailLanguage }) })
          await refreshSession()
        } catch (error) {
          notify(extractErrorMessage(error, tr('Could not save email language.')), 'danger')
        } finally {
          setBusy(false)
        }
      }}>
        {supportedLocales.map((locale) => <Option key={locale} value={locale}>{localeNames[locale]}</Option>)}
      </Select>
      <FormHelperText>{tr('Used for emails sent to your account. Invitation and escalation contacts use their own email language, or English if unknown.')}</FormHelperText>
    </FormControl>
  )
}
