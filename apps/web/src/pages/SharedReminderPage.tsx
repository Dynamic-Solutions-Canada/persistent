/** Recipient reading view, with canonical checklist progress and personal snooze. */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { useState } from 'react'
import Stack from '@mui/joy/Stack'
import Button from '@mui/joy/Button'
import Typography from '@mui/joy/Typography'
import Card from '@mui/joy/Card'
import ShareIcon from '@mui/icons-material/Share'
import { ReminderSharing } from '../components/ReminderSharing.js'
import { OccurrenceActions } from '../components/OccurrenceActions.js'
import { ReminderChecklist } from '../components/ReminderChecklist.js'
import { formatMedications, reminderBodyText } from '@persistent/shared'
import { useReceivedShares } from '../data/shares.js'
import { SectionHeading } from '../components/SectionHeading.js'
import { SnoozeDialog } from '../components/SnoozeDialog.js'
import { useAckOccurrence, useSnoozeOccurrence, useSilenceOccurrence } from '../data/occurrences.js'
import { useUpdateReminderContent } from '../data/reminders.js'
import { InlineReminderText } from '../components/InlineReminderText.js'
import { formatDateTime, formatWhen } from '../lib/datetime.js'
import { useSettings } from '../settings/useSettings.js'
import { useAuth } from '../auth/useAuth.js'

export function SharedReminderPage({ reminderId, onClose, onEdit }: {
  reminderId?: string
  onClose?: () => void
  onEdit?: () => void
} = {}) {
  useTranslation()
  const { id: routeId } = useParams()
  const id = reminderId ?? routeId
  const received = useReceivedShares()
  const reminder = received.data?.find((item) => item.id === id)
  const ack = useAckOccurrence()
  const snooze = useSnoozeOccurrence()
  const silence = useSilenceOccurrence()
  const updateContent = useUpdateReminderContent()
  const { timeFormat } = useSettings()
  const { user } = useAuth()
  const [snoozeId, setSnoozeId] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const canEdit = Boolean(onClose && reminder?.permission === 'EDIT')
  const canEditBody = Boolean(canEdit && reminder?.isNote && reminder?.type !== 'TODO')
  let body = reminder ? (reminder.type === 'TODO' ? reminder.details : reminderBodyText(reminder)) : null
  if (canEditBody && reminder) {
    body = reminder.type === 'MEDICATION' ? formatMedications(reminder.typeData) : null
  }

  return (
    <Stack spacing={2}>
      {!onClose && (
        <Button component={RouterLink} to="/" variant="plain" color="neutral" sx={{ alignSelf: 'flex-start' }}>{tr("Back")}</Button>
      )}
      {received.isLoading ? (
        <Typography level="body-sm">{tr("Loading...")}</Typography>
      ) : !reminder ? (
        <Typography level="body-sm">{tr("This reminder is no longer shared with you.")}</Typography>
      ) : (
        <>
          {canEdit ? (
            <Stack spacing={0.5}>
              <InlineReminderText
                kind="title"
                text={reminder.title}
                onSave={(title, expectedText) => updateContent.mutateAsync({ id: reminder.id, arg: { title, expectedText } })}
              />
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}><Trans i18nKey={"Shared by <v0/>"} components={{ v0: <>{reminder.ownerName}</> }} /></Typography>
            </Stack>
          ) : (
            <SectionHeading title={reminder.title} subtitle={tr("Shared by {{v0}}", { v0: reminder.ownerName })} />
          )}
          {reminder.nextScheduledFor && (
            <Typography level="body-sm"><Trans i18nKey={"Next notification for you: <v0/> (your time zone)"} components={{ v0: <>{formatWhen(reminder.nextScheduledFor, timeFormat, user?.timeZone)}</> }} /></Typography>
          )}
          {!onClose && reminder.permission === 'EDIT' && (
            <Button component={onEdit ? 'button' : RouterLink} to={onEdit ? undefined : `/reminders/${reminder.id}/edit`} onClick={onEdit} variant="outlined" sx={{ alignSelf: 'flex-start' }}>{tr("Edit reminder")}</Button>
          )}
          {(body || canEditBody || (reminder.type === 'TODO' && reminder.activeFirings.length === 0)) && <Card
            variant={reminder.type === 'TODO' && reminder.activeFirings.length === 0 ? 'plain' : 'soft'}
            sx={reminder.type === 'TODO' && reminder.activeFirings.length === 0
              ? { p: 0, bgcolor: 'transparent', boxShadow: 'none' }
              : undefined}
          >
            {body && <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>{body}</Typography>}
            {canEditBody && (
              <InlineReminderText
                kind="body"
                text={reminder.details ?? ''}
                onSave={(details, expectedText) => updateContent.mutateAsync({ id: reminder.id, arg: { details: details || null, expectedText } })}
              />
            )}
            {reminder.type === 'TODO' && reminder.activeFirings.length === 0 && (
              <ReminderChecklist
                reminder={{ ...reminder, hideCheckedItems: reminder.editableReminder?.hideCheckedItems ?? false }}
                isNote={reminder.isNote}
                editable={reminder.permission === 'EDIT'}
                actionable={reminder.permission !== 'VIEW'}
              />
            )}
          </Card>}
          {reminder.activeFirings.map((firing) => (
            <Card key={firing.id} variant="outlined">
              <Typography level="title-sm"><Trans i18nKey={"Needs attention: <v0/>"} components={{ v0: <>{formatDateTime(firing.scheduledFor, timeFormat, user?.timeZone)}</> }} /></Typography>
              {firing.status === 'SNOOZED' && firing.snoozedUntil && (
                <Typography level="body-sm"><Trans i18nKey={"Snoozed for you until <v0/>"} components={{ v0: <>{formatDateTime(firing.snoozedUntil, timeFormat, user?.timeZone)}</> }} /></Typography>
              )}
              {reminder.type === 'TODO' && (
                <ReminderChecklist
                  reminder={{ ...reminder, hideCheckedItems: reminder.editableReminder?.hideCheckedItems ?? false }}
                  isNote={reminder.isNote}
                  firing={firing}
                  editable={reminder.permission === 'EDIT'}
                  actionable={reminder.permission !== 'VIEW'}
                />
              )}
              <OccurrenceActions
                occurrence={{ ...firing, reminder: { title: reminder.title } }}
                onDone={() => ack.mutate({ id: firing.id, arg: undefined })}
                doneLoading={ack.isPending}
                onSnooze={() => setSnoozeId(firing.id)}
                onSilence={() => silence.mutate({ id: firing.id, arg: undefined })}
                silenceLoading={silence.isPending}
              />
            </Card>
          ))}
          {!onClose && (
            <Button variant="plain" startDecorator={<ShareIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => setShareOpen(true)}>{tr("Share")}</Button>
          )}
          <ReminderSharing open={shareOpen} onClose={() => setShareOpen(false)} reminderId={reminder.id} />
          <SnoozeDialog
            open={snoozeId !== null}
            busy={snooze.isPending}
            onClose={() => setSnoozeId(null)}
            onSnooze={(minutes) => {
              if (snoozeId) snooze.mutate({ id: snoozeId, arg: minutes })
              setSnoozeId(null)
            }}
          />
        </>
      )}
    </Stack>
  )
}
