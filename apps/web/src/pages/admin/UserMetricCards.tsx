import { formatNumber } from '../../lib/format.js'
/** Shared loaded/loading layout for account totals, keeping the admin dashboard stable during refreshes. */
import { useTranslation } from 'react-i18next'
import { tr } from '../../localization/i18n.js'
import Box from '@mui/joy/Box'
import Card from '@mui/joy/Card'
import Skeleton from '@mui/joy/Skeleton'
import Typography from '@mui/joy/Typography'
import type { AdminStats } from '@persistent/shared'

/** Labels remain visible while their counts load; an activity-window change masks only these counts. */
export function UserMetricCards({ users, activeDays, loading }: {
  users: AdminStats['users'] | undefined
  activeDays: 7 | 30
  loading: boolean
}) {
  useTranslation()
  const metrics = [
    ['Registered users', users?.total],
    [`Active (${activeDays} days)`, users?.active],
    [`Inactive (${activeDays} days)`, users?.inactive],
    ['Active in 24 hours', users?.day],
    ['Active in 7 days', users?.week],
    ['Active in 30 days', users?.month],
    ['New in 30 days', users?.newMonth],
    ['With reminders or notes', users?.withReminders]
  ] as const

  return (
    <Box aria-label={tr("User metrics")} aria-busy={loading}
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
      {metrics.map(([label, count]) => <Card key={label} variant="outlined">
        <Typography level="body-sm">{tr(label)}</Typography>
        <Typography level="h3" aria-hidden={loading}>
          <Skeleton loading={loading} variant="inline">{formatNumber((count ?? 0)) ?? '0'}</Skeleton>
        </Typography>
      </Card>)}
    </Box>
  )
}
