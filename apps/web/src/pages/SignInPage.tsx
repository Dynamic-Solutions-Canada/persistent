/**
 * Passwordless sign-in: request a one-time code by email, then enter it. The
 * same flow signs up new users. In demo mode the server returns the code, which
 * we surface so local testing needs no mail infra.
 */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useState, type FormEvent } from 'react'
import Box from '@mui/joy/Box'
import Sheet from '@mui/joy/Sheet'
import Typography from '@mui/joy/Typography'
import FormControl from '@mui/joy/FormControl'
import FormLabel from '@mui/joy/FormLabel'
import Input from '@mui/joy/Input'
import Button from '@mui/joy/Button'
import Alert from '@mui/joy/Alert'
import Link from '@mui/joy/Link'
import Divider from '@mui/joy/Divider'
import KeyRoundedIcon from '@mui/icons-material/KeyRounded'
import { useQuery } from '@tanstack/react-query'
import { type AuthConfig } from '@persistent/shared'
import { extractErrorMessage } from '../localization/errorMessage.js'
import { localizeInvalidInput, clearInputValidity } from '../localization/inputValidation.js'
import { LanguageSelect } from '../localization/LanguageSelect.js'
import { useAuth } from '../auth/useAuth.js'
import { apiFetch } from '../lib/apiClient.js'
import { BrandMark } from '../components/BrandMark.js'
import { GoogleSignInButton } from '../components/GoogleSignInButton.js'

export function SignInPage() {
  useTranslation()
  const { requestCode, verifyCode, loginWithPasskey, offline } = useAuth()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [emailOpen, setEmailOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const { data: config } = useQuery({
    queryKey: ['auth-config'],
    enabled: !offline,
    queryFn: () => apiFetch<AuthConfig>('/api/auth/config'),
    // Public sign-in options must load while authenticated writes are suspended.
    networkMode: 'always',
    retry: false
  })

  async function onPasskey() {
    setError(null)
    setPasskeyBusy(true)
    try {
      await loginWithPasskey()
      // On success the auth query refetches and App swaps to the shell.
    } catch (err) {
      // A user cancelling the prompt throws too; keep the message gentle.
      setError(extractErrorMessage(err, tr("Couldn't sign in with a passkey.")))
      setPasskeyBusy(false)
    }
  }

  async function onRequest(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await requestCode(email)
      setPreview(result.previewCode)
      setStep('code')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await verifyCode(email, code)
      // On success the auth query refetches and App swaps to the shell.
    } catch (err) {
      setError(extractErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', placeItems: 'center', p: 2 }}>
      <Sheet variant="outlined" sx={{ p: 3, borderRadius: 'lg', width: '100%', minWidth: 0, maxWidth: 380 }}>
        <Box sx={{ mb: 2 }}><LanguageSelect /></Box>
        <BrandMark size={56} />
        <Typography level="h3" sx={{ mt: 1.5, mb: 0.5 }}>
          Persistent
        </Typography>
        <Typography level="body-sm" sx={{ mb: 2 }}>{tr("Reminders that won't let you forget.")}</Typography>

        {offline && <Alert color="warning" sx={{ mb: 2 }}>{tr("Connect to the internet to sign in.")}</Alert>}
        {error && (
          <Alert color="danger" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {step === 'email' ? (
          <>
            {config?.googleClientId && (
              <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'center' }}>
                <GoogleSignInButton clientId={config.googleClientId} onError={setError} />
              </Box>
            )}
            <Button
              variant="soft"
              color="primary"
              fullWidth
              loading={passkeyBusy}
              startDecorator={<KeyRoundedIcon />}
              onClick={onPasskey}
            >{tr("Sign in with a passkey")}</Button>

            <Divider sx={{ my: 2 }}>
              <Typography level="body-xs" textColor="text.tertiary">{tr("or")}</Typography>
            </Divider>

            {!emailOpen ? (
              <Button variant="outlined" color="neutral" fullWidth onClick={() => setEmailOpen(true)}>{tr("Use email instead")}</Button>
            ) : (
              <form onSubmit={onRequest}>
                <FormControl sx={{ mb: 2 }}>
                  <FormLabel>{tr("Email")}</FormLabel>
                  <Input
                    type="email"
                    slotProps={{ input: { onInvalid: localizeInvalidInput, onInput: clearInputValidity } }}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tr("you@example.com")}
                    required
                    autoFocus
                  />
                </FormControl>
                <Button type="submit" loading={busy} fullWidth>{tr("Send sign-in code")}</Button>
              </form>
            )}
          </>
        ) : (
          <form onSubmit={onVerify}>
            {preview && (
              <Alert color="warning" sx={{ mb: 2 }}><Trans i18nKey={"Demo mode code: <c0><v1/></c0>"} components={{ c0: <strong />, v1: <>{preview}</> }} /></Alert>
            )}
            <FormControl sx={{ mb: 2 }}>
              <FormLabel><Trans i18nKey={"Code sent to <v0/>"} components={{ v0: <>{email}</> }} /></FormLabel>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
                autoFocus
                slotProps={{ input: { inputMode: 'numeric', autoComplete: 'one-time-code', onInvalid: localizeInvalidInput, onInput: clearInputValidity } }}
              />
            </FormControl>
            <Button type="submit" loading={busy} fullWidth sx={{ mb: 1 }}>{tr("Sign in")}</Button>
            <Link
              component="button"
              type="button"
              level="body-sm"
              onClick={() => {
                setStep('email')
                setCode('')
                setPreview(null)
              }}
            >{tr("Use a different email")}</Link>
          </form>
        )}
      </Sheet>
    </Box>
  )
}
