/** One account settings surface for identity, passkeys, sign-out, and deletion. */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { Link as RouterLink } from 'react-router-dom'
import Card from '@mui/joy/Card'
import Divider from '@mui/joy/Divider'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import Button from '@mui/joy/Button'
import Link from '@mui/joy/Link'
import { EmailLanguageSelect } from '../localization/EmailLanguageSelect.js'
import { useAuth } from '../auth/useAuth.js'
import { PasskeysSection } from './PasskeysSection.js'
import { DeleteAccountSection } from './DeleteAccountSection.js'

export function AccountSettingsCard() {
  useTranslation()
  const { user, logout } = useAuth()

  return (
    <Card variant="outlined">
      <Stack spacing={1.5}>
        <Typography level="title-sm">{tr("Account")}</Typography>
        <Typography level="body-sm">{user?.email}</Typography>
        <Typography level="body-xs"><Trans i18nKey={"Time zone: <v0/>"} components={{ v0: <>{user?.timeZone}</> }} /></Typography>
        <Link component={RouterLink} to="/settings/shared">{tr("Shared with me")}</Link>
        <Button
          variant="soft"
          color="danger"
          onClick={() => void logout()}
          sx={{ alignSelf: 'flex-start' }}
        >{tr("Sign out")}</Button>
        <EmailLanguageSelect />
        <Divider />
        <PasskeysSection />
        {/* Keep the irreversible action at the bottom, apart from everyday controls. */}
        <Divider />
        <DeleteAccountSection />
      </Stack>
    </Card>
  )
}
