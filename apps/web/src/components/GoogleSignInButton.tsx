/**
 * "Continue with Google" — native uses Credential Manager (the GoogleAuth
 * plugin) to get an ID token; web uses Google Identity Services' rendered button.
 * Both hand the ID token to useAuth().loginWithGoogle. Only shown when the server
 * reports a configured Google client id.
 */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useEffect, useRef } from 'react'
import Button from '@mui/joy/Button'
import GoogleIcon from '@mui/icons-material/Google'
import { extractErrorMessage } from '../localization/errorMessage.js'
import { useSettings } from '../settings/useSettings.js'
import { useAuth } from '../auth/useAuth.js'
import { GoogleAuthNative, isNative } from '../native/alarmBridge.js'

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void
      renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
    }
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'

let loadedLanguage: string | null = null
let loading: Promise<GoogleIdentityServices> | null = null

/** Google uses language codes and underscore regional variants in its SDK and button options. */
function googleLanguage(locale: string): string {
  if (locale === 'zh-CN') return 'zh_CN'
  if (locale === 'pt-BR') return 'pt_BR'
  return locale.split('-')[0]!
}

/** Serialize SDK language loads so an older response cannot replace a newer selection. */
function loadGis(language: string): Promise<GoogleIdentityServices> {
  if (loadedLanguage === language && loading) return loading
  const previous = loading
  loadedLanguage = language
  const next = (async () => {
    await previous?.catch(() => undefined)
    return loadGisScript(language)
  })()
  loading = next
  void next.catch(() => {
    if (loading === next) {
      loading = null
      loadedLanguage = null
    }
  })
  return next
}

/** Google's localized button API requires the SDK's language parameter as well as renderButton.locale. */
function loadGisScript(language: string): Promise<GoogleIdentityServices> {
  return new Promise((resolve, reject) => {
    document.querySelectorAll('script[data-persistent-gis]').forEach((script) => script.remove())
    const script = document.createElement('script')
    script.dataset.persistentGis = 'true'
    script.src = `${GIS_SRC}?hl=${encodeURIComponent(language)}`
    script.async = true
    script.defer = true
    script.onload = () => {
      const google = (window as unknown as { google?: GoogleIdentityServices }).google
      if (google?.accounts?.id) resolve(google)
      else reject(new Error(tr('Google sign-in failed to load.')))
    }
    script.onerror = () => reject(new Error(tr('Google sign-in failed to load.')))
    document.head.appendChild(script)
  })
}

export function GoogleSignInButton({ clientId, onError }: { clientId: string; onError: (message: string) => void }) {
  useTranslation()
  const { loginWithGoogle } = useAuth()
  const { locale } = useSettings()
  const webButtonRef = useRef<HTMLDivElement>(null)
  const native = isNative()

  useEffect(() => {
    if (native || !webButtonRef.current) return
    let cancelled = false
    const language = googleLanguage(locale)
    void (async () => {
      try {
        const gis = await loadGis(language)
        if (cancelled || !webButtonRef.current) return
        gis.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            void loginWithGoogle(credential).catch((error) => onError(extractErrorMessage(error, tr("Couldn't sign in with Google."))))
          }
        })
        const width = Math.min(400, Math.max(200, Math.floor(webButtonRef.current.clientWidth) || 320))
        gis.accounts.id.renderButton(webButtonRef.current, {
          locale: language,
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          logo_alignment: 'left',
          width
        })
      } catch (error) {
        if (!cancelled) onError(extractErrorMessage(error, tr("Couldn't load Google sign-in.")))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [native, clientId, loginWithGoogle, onError, locale])

  if (native) {
    return (
      <Button
        variant="outlined"
        color="neutral"
        fullWidth
        startDecorator={<GoogleIcon />}
        onClick={async () => {
          try {
            const { idToken } = await GoogleAuthNative.signIn({ serverClientId: clientId })
            await loginWithGoogle(idToken)
          } catch (err) {
            onError(extractErrorMessage(err, tr("Couldn't sign in with Google.")))
          }
        }}
      >{tr("Continue with Google")}</Button>
    )
  }

  // Web: GIS renders its own button into this full-width element.
  return <div ref={webButtonRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
}
