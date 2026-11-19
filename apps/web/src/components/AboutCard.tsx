/**
 * The About card in Settings (BRAND-8), the web app's one About surface, which
 * every native host also shows. Items in BRAND-8 order: name and version,
 * tagline, updates, source code, privacy, support, licence and third-party
 * notices. "Open logs folder" is omitted on the web (LOG-8): the maintainer reads
 * the server logs. Link labels copy winui-app-kit's `kit.about.*` wording.
 *
 * Help and account-deletion links sit here too, then "Reset this device".
 */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { Link as RouterLink } from 'react-router-dom'
import Card from '@mui/joy/Card'
import Divider from '@mui/joy/Divider'
import Link from '@mui/joy/Link'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import { SOURCE_REPOSITORY_URL } from '@persistent/shared'
import { AppUpdateInformation } from '../native/AppUpdateInformation.js'
import { useAppVersion } from '../native/useAppVersion.js'
import { ResetDeviceSection } from './ResetDeviceSection.js'

/** Support goes to the repository's issues, which carry the issue template (D-086). */
const SUPPORT_URL = `${SOURCE_REPOSITORY_URL}/issues`
const LICENSE_URL = `${SOURCE_REPOSITORY_URL}/blob/main/LICENSE`

/** An external link, opened outside the app (the desktop hosts send these to the browser). */
function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </Link>
  )
}

export function AboutCard() {
  useTranslation()
  const version = useAppVersion()

  return (
    <Card variant="outlined">
      <Stack spacing={1.5}>
        {/* 1-2: name, version and the store tagline. */}
        <Stack spacing={0.5}>
          <Typography level="title-sm">{tr('About')}</Typography>
          <Typography level="body-sm">
            <Trans
              i18nKey={'Version <v0/>'}
              components={{ v0: <>{version}</> }}
            />
          </Typography>
          <Typography level="body-sm">{tr('about.tagline')}</Typography>
        </Stack>

        {/* 3: updates, as this host provides them. */}
        <Stack spacing={1.5}>
          <AppUpdateInformation />
        </Stack>

        {/* 4-7: source, privacy, support, licence and notices. */}
        <Stack spacing={0.75} component="ul" sx={{ m: 0, pl: 0 }}>
          {[
            <ExternalLink
              key="source"
              href={SOURCE_REPOSITORY_URL}
              label={tr('about.source-code')}
            />,
            <Link key="privacy" component={RouterLink} to="/privacy">
              {tr('Privacy policy')}
            </Link>,
            <ExternalLink
              key="support"
              href={SUPPORT_URL}
              label={tr('about.support')}
            />,
            <ExternalLink
              key="license"
              href={LICENSE_URL}
              label={tr('about.license')}
            />,
            <Link
              key="notices"
              component={RouterLink}
              to="/third-party-notices"
            >
              {tr('about.third-party-notices')}
            </Link>,
            <Link key="help" component={RouterLink} to="/help">
              {tr('about.how-it-works')}
            </Link>,
            <Link key="delete" component={RouterLink} to="/delete-account">
              {tr('about.deleting-your-account')}
            </Link>,
          ].map((link) => (
            <Typography
              key={link.key}
              component="li"
              level="body-sm"
              sx={{ listStyle: 'none' }}
            >
              {link}
            </Typography>
          ))}
        </Stack>

        <Divider />
        <ResetDeviceSection />
      </Stack>
    </Card>
  )
}
