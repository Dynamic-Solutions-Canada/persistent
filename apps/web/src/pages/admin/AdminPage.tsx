/** Administrator-only aggregate dashboard; online authorization and data freshness are explicit. */
import { useState } from 'react'
import { Link as RouterLink, Navigate } from 'react-router-dom'
import Stack from '@mui/joy/Stack'
import Skeleton from '@mui/joy/Skeleton'
import Button from '@mui/joy/Button'
import Typography from '@mui/joy/Typography'
import Select from '@mui/joy/Select'
import Option from '@mui/joy/Option'
import FormControl from '@mui/joy/FormControl'
import FormLabel from '@mui/joy/FormLabel'
import Alert from '@mui/joy/Alert'
import { reminderStatLabels, occurrenceStatLabels, collaborationStatLabels, type AdminGrowthDays } from '@persistent/shared'
import { useAuth } from '../../auth/useAuth.js'
import { useAdminStats } from '../../data/admin.js'
import { SectionHeading } from '../../components/SectionHeading.js'
import { formatDateTime } from '../../lib/datetime.js'
import { ApiError } from '../../lib/apiClient.js'
import { MetricTable } from './MetricTable.js'
import { ClientUsageTable } from './ClientUsageTable.js'
import { UserGrowthChart } from './UserGrowthChart.js'
import { UserMetricCards } from './UserMetricCards.js'

const typeLabels = { NONE: 'Plain', TODO: 'Checklist', MEDICATION: 'Medication' }
const scheduleLabels = { never: 'Note', none: 'Unscheduled', once: 'One time', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', interval: 'Interval', custom: 'Custom' }

export function AdminPage() {
  const { user, offline } = useAuth()
  const [activeDays, setActiveDays] = useState<7 | 30>(30)
  const [growthDays, setGrowthDays] = useState<AdminGrowthDays>(90)
  const stats = useAdminStats(activeDays, growthDays)
  if (!user?.isAdmin) return <Navigate to="/settings" replace />

  const data = !offline && !stats.error ? stats.data : undefined
  const denied = stats.error instanceof ApiError && [401, 403].includes(stats.error.status)
  const initialLoading = stats.isPending && !offline && !stats.error

  return (
    <Stack spacing={1.5}>
      <Button component={RouterLink} to="/settings" variant="plain" color="neutral" sx={{ alignSelf: 'flex-start' }}>Back to Settings</Button>
      <SectionHeading title="Administration" subtitle="Aggregate account activity and feature adoption" />
      <Typography level="body-sm">
        Active means authenticated service activity, including background app sync. Offline usage is not visible until reconnecting.
        Inactive includes accounts with no recent activity. Counts include administrators and test accounts.
      </Typography>
      <Stack direction="row" spacing={1.5} alignItems="flex-end">
        <FormControl sx={{ flex: 1 }}>
          <FormLabel>Active-user window</FormLabel>
          <Select value={activeDays} onChange={(_event, value) => { if (value) setActiveDays(value) }}>
            <Option value={30}>Last 30 days</Option><Option value={7}>Last 7 days</Option>
          </Select>
        </FormControl>
        <Button variant="outlined" disabled={offline || denied} loading={stats.isFetching} onClick={() => { void stats.refetch() }}>Refresh</Button>
      </Stack>
      {offline && <Alert color="warning">Connect to the service to view administrative statistics.</Alert>}
      {stats.error && !offline && <Alert color="danger">{denied ? 'Administrator access is no longer available.' : 'Could not load statistics. Try Refresh.'}</Alert>}
      {(data || initialLoading) && <>
        <Typography level="body-xs" role={initialLoading ? 'status' : undefined}>
          <Skeleton loading={initialLoading} variant="inline">
            {data ? `Snapshot: ${formatDateTime(data.generatedAt, '12h', 'America/Toronto')} (Toronto)` : 'Loading statistics...'}
          </Skeleton>
        </Typography>
        <UserMetricCards users={data?.users} activeDays={activeDays} loading={!data || data.activeDays !== activeDays} />
        <UserGrowthChart growth={data?.userGrowth} days={growthDays}
          loading={!data || data.userGrowth.days !== growthDays} onDaysChange={setGrowthDays} />
      </>}
      {data && <>
        <MetricTable title="Reminders and notes" subtitle="Saved definitions, including paused reminders. Features overlap; Users counts distinct owners." metrics={data.reminders} labels={reminderStatLabels} />
        <Typography level="body-sm">Nag and alarm counts show configuration, not how often a device played a sound. Notes never nag or alarm.</Typography>
        <MetricTable title="Reminder types" subtitle="Includes reminders and notes." metrics={data.types} labels={typeLabels} />
        <MetricTable title="Schedules" subtitle="One schedule kind per saved definition." metrics={data.schedules} labels={scheduleLabels} />
        <MetricTable title="Completion and escalation" subtitle="Retained reminder history. Date-based counts use the last 30 days; current waiting and snoozed counts have no date limit." metrics={data.occurrences} labels={occurrenceStatLabels} />
        <MetricTable title="Sharing and assignment" subtitle="Current collaboration records. Users counts distinct creators." metrics={data.collaboration} labels={collaborationStatLabels} />
        <ClientUsageTable clients={data.clients} />
        <Typography level="body-xs">Deleted accounts, definitions and their history are excluded. Notification and escalation timestamps do not confirm delivery. This is a snapshot, not a permanent event log. Refresh to see changes.</Typography>
      </>}
    </Stack>
  )
}
