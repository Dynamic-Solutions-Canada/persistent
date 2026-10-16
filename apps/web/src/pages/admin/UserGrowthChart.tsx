/** Aggregate account growth with independent time/metric controls and accessible daily counts. */
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
  const [metric, setMetric] = useState<GrowthMetric>('total')
  const [dateIndex, setDateIndex] = useState<number | null>(null)
  const points = growth?.points ?? []
  const selectedIndex = Math.max(0, Math.min(dateIndex ?? points.length - 1, points.length - 1))
  const selected = points[selectedIndex]
  const signups = points.reduce((sum, point) => sum + point.signups, 0)

  return (
    <Card variant="outlined" aria-busy={loading}>
      <SectionHeading title="User growth" subtitle="See how quickly new users are signing up." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <FormControl sx={{ flex: 1 }}>
          <FormLabel>Growth period</FormLabel>
          <Select value={days} onChange={(_event, value) => {
            if (value) {
              setDateIndex(null)
              onDaysChange(value)
            }
          }}>
            <Option value={30}>Last 30 days</Option>
            <Option value={90}>Last 90 days</Option>
            <Option value={365}>Last year</Option>
          </Select>
        </FormControl>
        <FormControl sx={{ flex: 1 }}>
          <FormLabel>Show</FormLabel>
          <Select value={metric} onChange={(_event, value) => { if (value) setMetric(value) }}>
            <Option value="total">Total users</Option>
            <Option value="signups">Daily sign-ups</Option>
          </Select>
        </FormControl>
      </Stack>
      <Typography level="body-sm" aria-hidden={loading}>
        <Skeleton loading={loading} variant="inline">
          {signups.toLocaleString('en-CA')} sign-ups in this period
          {' · '}{(signups / (growth?.days ?? days)).toLocaleString('en-CA', { maximumFractionDigits: 1 })} per day on average
        </Skeleton>
      </Typography>
      <Box role={loading ? 'status' : undefined} aria-label={loading ? 'Loading user growth' : undefined} sx={{ position: 'relative' }}>
        <Box aria-hidden={loading} sx={{ visibility: loading ? 'hidden' : 'visible' }}>
          <UserGrowthPlot points={points} metric={metric} selectedIndex={selectedIndex} onSelect={setDateIndex} />
        </Box>
        <Skeleton loading={loading} variant="overlay" />
      </Box>
      <Typography level="body-sm" aria-live={loading ? 'off' : 'polite'} aria-atomic="true" aria-hidden={loading}>
        <Skeleton loading={loading} variant="inline">
          {selected ? `${growthDateLabel(selected.date)}: ${selected.total.toLocaleString('en-CA')} total users, ${selected.signups.toLocaleString('en-CA')} sign-ups` : 'No growth data yet.'}
        </Skeleton>
      </Typography>
      <FormControl>
        <FormLabel>Explore daily counts</FormLabel>
        <Slider min={0} max={Math.max(1, points.length - 1)} step={1} value={selectedIndex} disabled={loading || points.length < 2}
          aria-label="Explore daily counts"
          getAriaValueText={(index) => points[index] ? growthDateLabel(points[index]!.date) : 'No date available'}
          onChange={(_event, value) => { if (typeof value === 'number') setDateIndex(value) }} />
      </FormControl>
      <Typography level="body-xs">
        Based on accounts that still exist; deleted accounts are excluded from every date.
        Totals are cumulative through each day. Dates use Toronto time; today is partial.
      </Typography>
      <details>
        <Typography component="summary" level="body-sm" aria-disabled={loading}
          onClick={(event) => { if (loading) event.preventDefault() }} sx={{ cursor: loading ? 'default' : 'pointer' }}>View daily counts</Typography>
        <Stack aria-hidden={loading} sx={{ maxHeight: 320, overflow: 'auto', position: 'relative' }}>
          <Table size="sm" aria-label="Daily user growth" sx={{ '& th:first-of-type': { width: '45%' }, '& th, & td': { whiteSpace: 'normal' } }}>
            <thead><tr><th scope="col">Date</th><th scope="col">Total users</th><th scope="col">Sign-ups</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.date}>
              <th scope="row">{growthDateLabel(point.date)}</th><td>{point.total.toLocaleString('en-CA')}</td><td>{point.signups.toLocaleString('en-CA')}</td>
            </tr>)}</tbody>
          </Table>
          <Skeleton loading={loading} variant="overlay" />
        </Stack>
      </details>
    </Card>
  )
}
