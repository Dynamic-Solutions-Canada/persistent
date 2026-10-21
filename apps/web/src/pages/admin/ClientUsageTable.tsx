import { formatNumber } from '../../lib/format.js'
/** Recent session groups describe adoption, not device or installation counts. */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../../localization/i18n.js'
import Card from '@mui/joy/Card'
import Table from '@mui/joy/Table'
import Typography from '@mui/joy/Typography'
import type { AdminStats } from '@persistent/shared'
import { SectionHeading } from '../../components/SectionHeading.js'

const appLabels = { browser: 'Web browser', pwa: 'Installed PWA', android: 'Android app', windows: 'Windows app', linux: 'Linux app' }
const platformLabels = { android: 'Android', ios: 'iOS', windows: 'Windows', macos: 'macOS', linux: 'Linux', unknown: 'Unknown OS' }

export function ClientUsageTable({ clients }: { clients: AdminStats['clients'] }) {
  useTranslation()
  return (
    <Card variant="outlined">
      <SectionHeading title={tr("Apps and platforms")} subtitle={tr("Sessions active within 30 days. Users may appear in multiple groups.")} />
      <Typography level="body-sm">{tr("Clients report their app, platform and web version on opening or returning to the app. Older sessions remain unknown until they report. These are session counts, not device counts. Browser OS detection is approximate; iPads may identify as macOS.")}</Typography>
      {clients.length === 0 ? <Typography level="body-sm">{tr("No recent sessions.")}</Typography> : (
        <Table size="sm" aria-label={tr("Apps and platforms")} sx={{ '& th:first-of-type': { width: '52%' }, '& th:nth-of-type(2)': { width: '20%' }, '& td, & th': { whiteSpace: 'normal', overflowWrap: 'anywhere' } }}>
          <thead><tr><th scope="col">{tr("App / platform / version")}</th><th scope="col">{tr("Users")}</th><th scope="col">{tr("Sessions")}</th></tr></thead>
          <tbody>{clients.map((client) => (
            <tr key={JSON.stringify([client.app, client.platform, client.webVersion, client.nativeVersion])}>
              <th scope="row">
                {client.app ? tr(appLabels[client.app]) : tr("Unknown app")} / {client.platform ? tr(platformLabels[client.platform]) : tr("Unknown OS")}
                <Typography level="body-xs"><Trans i18nKey={"Web: <v0/>"} components={{ v0: <>{client.webVersion ?? tr('Not reported')}</> }} /></Typography>
                {(client.app === 'android' || client.app === 'windows' || client.app === 'linux') && (
                  <Typography level="body-xs"><Trans i18nKey={"Native: <v0/>"} components={{ v0: <>{client.nativeVersion ?? tr('Not reported')}</> }} /></Typography>
                )}
              </th>
              <td>{formatNumber(client.users)}</td><td>{formatNumber(client.sessions)}</td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </Card>
  )
}
