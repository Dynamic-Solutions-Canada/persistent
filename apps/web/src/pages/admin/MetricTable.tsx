import { formatNumber } from '../../lib/format.js'
/** Compact shared treatment for aggregate totals and distinct user counts at phone widths. */
import { useTranslation } from 'react-i18next'
import { tr } from '../../localization/i18n.js'
import Card from '@mui/joy/Card'
import Table from '@mui/joy/Table'
import Typography from '@mui/joy/Typography'
import type { AdminMetric } from '@persistent/shared'
import { SectionHeading } from '../../components/SectionHeading.js'

export function MetricTable({ title, subtitle, metrics, labels }: {
  title: string
  subtitle: string
  metrics: AdminMetric[]
  labels: Record<string, string>
}) {
  useTranslation()
  return (
    <Card variant="outlined">
      <SectionHeading title={title} subtitle={subtitle} />
      {metrics.length === 0 ? <Typography level="body-sm">{tr("No data yet.")}</Typography> : (
        <Table size="sm" aria-label={title} sx={{ '& th:first-of-type': { width: '60%' }, '& td, & th': { whiteSpace: 'normal', overflowWrap: 'anywhere' } }}>
          <thead><tr><th scope="col">{tr("Metric")}</th><th scope="col">{tr("Total")}</th><th scope="col">{tr("Users")}</th></tr></thead>
          <tbody>{metrics.map((metric) => (
            <tr key={metric.key}>
              <th scope="row">{labels[metric.key] ? tr(labels[metric.key]!) : metric.key}</th>
              <td>{formatNumber(metric.count)}</td>
              <td>{formatNumber(metric.users)}</td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </Card>
  )
}
