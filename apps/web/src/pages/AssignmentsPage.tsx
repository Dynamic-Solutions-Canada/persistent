/** Creator-only status of reminders made for someone else. */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import Button from '@mui/joy/Button'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import Sheet from '@mui/joy/Sheet'
import Chip from '@mui/joy/Chip'
import { Link as RouterLink } from 'react-router-dom'
import { useSentAssignments, useResendAssignmentInvitation } from '../data/assignments.js'
import { formatWhen } from '../lib/datetime.js'
import { useSettings } from '../settings/useSettings.js'
import { useAuth } from '../auth/useAuth.js'
import { SectionHeading } from '../components/SectionHeading.js'
import { PullToRefresh } from '../components/PullToRefresh.js'

/** A firing remains independently visible, including exactly when it was done. */
function firingLabel(firing: { status: string; acknowledgedAt: string | null }): string {
  if (firing.status === 'ACKNOWLEDGED') return tr("Done")
  if (firing.status === 'PENDING') return tr("Scheduled")
  if (firing.status === 'SNOOZED') return tr("Snoozed")
  if (firing.status === 'ESCALATED') return tr("Escalated")
  if (firing.status === 'FIRED') return tr("Waiting")
  return firing.status === 'MISSED' ? 'Missed' : 'Past'
}

export function AssignmentsPage() {
  useTranslation()
  const sent = useSentAssignments()
  const resend = useResendAssignmentInvitation()
  const { timeFormat } = useSettings()
  const { user } = useAuth()

  return (
    <PullToRefresh onRefresh={() => sent.refetch()}>
      <Stack spacing={2}>
        <SectionHeading title={tr("Assigned by me")} subtitle={tr("See when reminders you made for someone else are handled.")} />
        {sent.isLoading && <Typography level="body-sm">{tr("Loading...")}</Typography>}
        {sent.data?.length === 0 && (
          <Typography level="body-sm">
            {tr("No assignments yet. Open ")}<RouterLink to="/reminders/new">{tr("New reminder")}</RouterLink>{tr(", then choose For someone else in Share.")}</Typography>
        )}
        {sent.data?.map((assignment) => (
          <Sheet key={assignment.id} variant="outlined" sx={{ p: 2, borderRadius: 'md' }}>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                <Typography level="title-md">{assignment.title}</Typography>
                <Chip size="sm" variant="soft" color={assignment.state === 'DECLINED' ? 'danger' : 'neutral'}>
                  {assignment.state === 'PENDING' ? tr("Invitation pending") : assignment.state === 'DECLINED' ? tr("Declined") : tr("Assigned")}
                </Chip>
              </Stack>
              <Typography level="body-sm"><Trans i18nKey={"For <v0/>"} components={{ v0: <>{assignment.recipientEmail}</> }} /></Typography>
              {assignment.lastCompletedAt && (
                <Typography level="body-sm"><Trans i18nKey={"Last completed <v0/>"} components={{ v0: <>{formatWhen(assignment.lastCompletedAt, timeFormat, user?.timeZone)}</> }} /></Typography>
              )}
              {assignment.declinedAt && (
                <Typography level="body-sm"><Trans i18nKey={"Declined <v0/>"} components={{ v0: <>{formatWhen(assignment.declinedAt, timeFormat, user?.timeZone)}</> }} /></Typography>
              )}
              {assignment.state === 'PENDING' && (
                <Button size="sm" variant="outlined" loading={resend.isPending} onClick={() => resend.mutate(assignment.id)}>{tr("Resend invitation")}</Button>
              )}
              {assignment.state === 'ACTIVE' && assignment.recentFirings.length === 0 && (
                <Typography level="body-sm">{tr("No firing yet.")}</Typography>
              )}
              {assignment.state === 'ACTIVE' && assignment.recentFirings.length > 0 && (
                <Stack spacing={0.5}>
                  <Typography level="title-sm">{tr("Recent firings")}</Typography>
                  {assignment.recentFirings.map((firing) => (
                    <Typography key={firing.id} level="body-sm">
                      {formatWhen(firing.scheduledFor, timeFormat, user?.timeZone)}: {firingLabel(firing)}
                      {firing.acknowledgedAt ? tr(" at {{v0}}", { v0: formatWhen(firing.acknowledgedAt, timeFormat, user?.timeZone) }) : ''}
                    </Typography>
                  ))}
                </Stack>
              )}
            </Stack>
          </Sheet>
        ))}
      </Stack>
    </PullToRefresh>
  )
}
