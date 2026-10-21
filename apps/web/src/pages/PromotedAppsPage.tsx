import { promotionCopy } from '@persistent/shared'
import { useSettings } from '../settings/useSettings.js'
/** Mobile-first view of the publisher's other apps, with explicit platform destinations. */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { Link as RouterLink } from 'react-router-dom'
import Avatar from '@mui/joy/Avatar'
import Button from '@mui/joy/Button'
import Card from '@mui/joy/Card'
import Chip from '@mui/joy/Chip'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import { SectionHeading } from '../components/SectionHeading.js'
import { usePromotedApps } from '../data/promotedApps.js'
import { CATALOG_BASE_URL } from '../../../desktop/external/promo/catalog.js'

// Vite includes these immutable assets in the build and the offline precache.
const icons = import.meta.glob<string>(
  '../../../desktop/external/promo/Assets/PromotedApps/*.png',
  { eager: true, query: '?url', import: 'default' }
)

export function PromotedAppsPage() {
  useTranslation()
  const { locale } = useSettings()
  const catalog = usePromotedApps()
  const apps = catalog.data.filter((app) => app.appId !== 'persistent')

  return (
    <Stack spacing={1.5}>
      <Button component={RouterLink} to="/settings" variant="plain" sx={{ alignSelf: 'flex-start' }}>{tr("Back to Settings")}</Button>
      <SectionHeading title={tr("Our other apps")} subtitle={tr("More from Dynamic Solutions Canada.")} />
      {apps.map((app) => (
        <Card key={app.appId} variant="outlined">
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              src={icons[`../../../desktop/external/promo/Assets/PromotedApps/${app.icon}`] ?? `${CATALOG_BASE_URL}${app.icon}`}
              alt=""
              variant="plain"
              slotProps={{ img: { crossOrigin: 'anonymous' } }}
            >
              {app.name.slice(0, 1)}
            </Avatar>
            <Stack spacing={0.5}>
              <Typography level="title-sm">{app.name}</Typography>
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                {[...new Set(app.links.map((link) => link.platform))].map((platform) => (
                  <Chip key={platform} size="sm" variant="soft">{platform}</Chip>
                ))}
              </Stack>
            </Stack>
          </Stack>
          <Typography level="body-sm">{promotionCopy(locale, app.blurb)}</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {app.links.map((link) => (
              <Button
                key={`${link.platform}:${link.url}`}
                component="a"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                size="sm"
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                {link.platform}: {promotionCopy(locale, link.label)}
              </Button>
            ))}
          </Stack>
        </Card>
      ))}
      {apps.length === 0 && <Typography level="body-sm">{tr("No other apps are listed right now.")}</Typography>}
    </Stack>
  )
}
