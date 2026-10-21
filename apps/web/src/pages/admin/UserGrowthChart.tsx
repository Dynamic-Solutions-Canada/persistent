import { formatNumber } from '../../lib/format.js'
/** Aggregate account growth with independent time/metric controls and accessible daily counts. */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../../localization/i18n.js'
import { useState } from 'react'
import Card from '@mui/joy/Card'
import Box from '@mui/joy/Box'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import Select from '@mui/joy/Select'
import Option from '@mui/joy/Option'
import FormControl from '@mui/joy/FormControl'
import FormLabel from '@mui/joy/FormLabel'
import Slider from '@mui/joy/Slider'
import Table from '@mui/joy/Table'
import Skeleton from '@mui/joy/Skeleton'
import type { AdminGrowthDays, AdminUserGrowth } from '@persistent/shared'
import { SectionHeading } from '../../components/SectionHeading.js'
import { UserGrowthPlot, type GrowthMetric } from './UserGrowthPlot.js'
import { growthDateLabel } from './userGrowth.js'

/** Keep chart exploration local; changing its date window requests a fresh authorized snapshot. */
export function UserGrowthChart({ growth, days, loading = false, onDaysChange }: {
  growth?: AdminUserGrowth
  days: AdminGrowthDays
  loading?: boolean
  onDaysChange: (days: AdminGrowthDays) => void
}) {
  useTranslation()
  const [metric, setMetric] = useState<GrowthMetric>('total')
  const [dateIndex, setDateIndex] = useState<number | null>(null)
  const points = growth?.points ?? []
  const selectedIndex = Math.max(0, Math.min(dateIndex ?? points.length - 1, points.length - 1))
  const selected = points[selectedIndex]
  const signups = points.reduce((sum, point) => sum + point.signups, 0)

  return (
    <Card variant="outlined" aria-busy={loading}>
      <SectionHeading title={tr("User growth")} subtitle={tr("See how quickly new users are signing up.")} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <FormControl sx={{ flex: 1 }}>
          <FormLabel>{tr("Growth period")}</FormLabel>
          <Select value={days} onChange={(_event, value) => {
            if (value) {
              setDateIndex(null)
              onDaysChange(value)
            }
          }}>
            <Option value={30}>{tr("Last 30 days")}</Option>
            <Option value={90}>{tr("Last 90 days")}</Option>
            <Option value={365}>{tr("Last year")}</Option>
          </Select>
        </FormControl>
        <FormControl sx={{ flex: 1 }}>
          <FormLabel>{tr("Show")}</FormLabel>
          <Select value={metric} onChange={(_event, value) => { if (value) setMetric(value) }}>
            <Option value="total">{tr("Total users")}</Option>
            <Option value="signups">{tr("Daily sign-ups")}</Option>
          </Select>
        </FormControl>
      </Stack>
      <Typography level="body-sm" aria-hidden={loading}>
        <Skeleton loading={loading} variant="inline"><Trans i18nKey={"<v0/> sign-ups in this period · <v1/> per day on average"} components={{ v0: <>{formatNumber(signups)}</>, v1: <>{formatNumber((signups / (growth?.days ?? days)), { maximumFractionDigits: 1 })}</> }} /></Skeleton>
      </Typography>
      <Box role={loading ? 'status' : undefined} aria-label={loading ? tr("Loading user growth") : undefined} sx={{ position: 'relative' }}>
        <Box aria-hidden={loading} sx={{ visibility: loading ? 'hidden' : 'visible' }}>
          <UserGrowthPlot points={points} metric={metric} selectedIndex={selectedIndex} onSelect={setDateIndex} />
        </Box>
        <Skeleton loading={loading} variant="overlay" />
      </Box>
      <Typography level="body-sm" aria-live={loading ? 'off' : 'polite'} aria-atomic="true" aria-hidden={loading}>
        <Skeleton loading={loading} variant="inline">
          {selected ? tr("{{v0}}: {{v1}} total users, {{v2}} sign-ups", { v0: growthDateLabel(selected.date), v1: formatNumber(selected.total), v2: formatNumber(selected.signups) }) : tr("No growth data yet.")}
        </Skeleton>
      </Typography>
      <FormControl>
        <FormLabel>{tr("Explore daily counts")}</FormLabel>
        <Slider min={0} max={Math.max(1, points.length - 1)} step={1} value={selectedIndex} disabled={loading || points.length < 2}
          aria-label={tr("Explore daily counts")}
          getAriaValueText={(index) => points[index] ? growthDateLabel(points[index]!.date) : tr('No date available')}
          onChange={(_event, value) => { if (typeof value === 'number') setDateIndex(value) }} />
      </FormControl>
      <Typography level="body-xs">{tr("Based on accounts that still exist; deleted accounts are excluded from every date. Totals are cumulative through each day. Dates use Toronto time; today is partial.")}</Typography>
      <details>
        <Typography component="summary" level="body-sm" aria-disabled={loading}
          onClick={(event) => { if (loading) event.preventDefault() }} sx={{ cursor: loading ? 'default' : 'pointer' }}>{tr("View daily counts")}</Typography>
        <Stack aria-hidden={loading} sx={{ maxHeight: 320, overflow: 'auto', position: 'relative' }}>
          <Table size="sm" aria-label={tr("Daily user growth")} sx={{ '& th:first-of-type': { width: '45%' }, '& th, & td': { whiteSpace: 'normal' } }}>
            <thead><tr><th scope="col">{tr("Date")}</th><th scope="col">{tr("Total users")}</th><th scope="col">{tr("Sign-ups")}</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.date}>
              <th scope="row">{growthDateLabel(point.date)}</th><td>{formatNumber(point.total)}</td><td>{formatNumber(point.signups)}</td>
            </tr>)}</tbody>
          </Table>
          <Skeleton loading={loading} variant="overlay" />
        </Stack>
      </details>
    </Card>
  )
}
