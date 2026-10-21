/** Administrator-only aggregate dashboard; online authorization and data freshness are explicit. */
import { useTranslation } from 'react-i18next'
import { tr } from '../../localization/i18n.js'
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
  useTranslation()
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
      <Button component={RouterLink} to="/settings" variant="plain" color="neutral" sx={{ alignSelf: 'flex-start' }}>{tr("Back to Settings")}</Button>
      <SectionHeading title={tr("Administration")} subtitle={tr("Aggregate account activity and feature adoption")} />
      <Typography level="body-sm">{tr("Active means authenticated service activity, including background app sync. Offline usage is not visible until reconnecting. Inactive includes accounts with no recent activity. Counts include administrators and test accounts.")}</Typography>
      <Stack direction="row" spacing={1.5} alignItems="flex-end">
        <FormControl sx={{ flex: 1 }}>
          <FormLabel>{tr("Active-user window")}</FormLabel>
          <Select value={activeDays} onChange={(_event, value) => { if (value) setActiveDays(value) }}>
            <Option value={30}>{tr("Last 30 days")}</Option><Option value={7}>{tr("Last 7 days")}</Option>
          </Select>
        </FormControl>
        <Button variant="outlined" disabled={offline || denied} loading={stats.isFetching} onClick={() => { void stats.refetch() }}>{tr("Refresh")}</Button>
      </Stack>
      {offline && <Alert color="warning">{tr("Connect to the service to view administrative statistics.")}</Alert>}
      {stats.error && !offline && <Alert color="danger">{denied ? tr("Administrator access is no longer available.") : tr("Could not load statistics. Try Refresh.")}</Alert>}
      {(data || initialLoading) && <>
        <Typography level="body-xs" role={initialLoading ? 'status' : undefined}>
          <Skeleton loading={initialLoading} variant="inline">
            {data ? tr("Snapshot: {{v0}} (Toronto)", { v0: formatDateTime(data.generatedAt, '12h', 'America/Toronto') }) : tr("Loading statistics...")}
          </Skeleton>
        </Typography>
        <UserMetricCards users={data?.users} activeDays={activeDays} loading={!data || data.activeDays !== activeDays} />
        <UserGrowthChart growth={data?.userGrowth} days={growthDays}
          loading={!data || data.userGrowth.days !== growthDays} onDaysChange={setGrowthDays} />
      </>}
      {data && <>
        <MetricTable title={tr("Reminders and notes")} subtitle={tr("Saved definitions, including paused reminders. Features overlap; Users counts distinct owners.")} metrics={data.reminders} labels={reminderStatLabels} />
        <Typography level="body-sm">{tr("Nag and alarm counts show configuration, not how often a device played a sound. Notes never nag or alarm.")}</Typography>
        <MetricTable title={tr("Reminder types")} subtitle={tr("Includes reminders and notes.")} metrics={data.types} labels={typeLabels} />
        <MetricTable title={tr("Schedules")} subtitle={tr("One schedule kind per saved definition.")} metrics={data.schedules} labels={scheduleLabels} />
        <MetricTable title={tr("Completion and escalation")} subtitle={tr("Retained reminder history. Date-based counts use the last 30 days; current waiting and snoozed counts have no date limit.")} metrics={data.occurrences} labels={occurrenceStatLabels} />
        <MetricTable title={tr("Sharing and assignment")} subtitle={tr("Current collaboration records. Users counts distinct creators.")} metrics={data.collaboration} labels={collaborationStatLabels} />
        <ClientUsageTable clients={data.clients} />
        <Typography level="body-xs">{tr("Deleted accounts, definitions and their history are excluded. Notification and escalation timestamps do not confirm delivery. This is a snapshot, not a permanent event log. Refresh to see changes.")}</Typography>
      </>}
    </Stack>
  )
}
