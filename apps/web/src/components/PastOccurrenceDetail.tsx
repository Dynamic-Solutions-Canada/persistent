/** Reading view for the exact History firing selected, including its saved checklist progress. */
import Stack from '@mui/joy/Stack'
import Button from '@mui/joy/Button'
import Typography from '@mui/joy/Typography'
import type { Occurrence } from '@persistent/shared'
import { useUndoDoneOccurrence } from '../data/occurrences.js'
import { useAuth } from '../auth/useAuth.js'
import { useSettings } from '../settings/useSettings.js'
import { formatWhen } from '../lib/datetime.js'
import { reminderPreviewBody } from '../lib/reminderPreview.js'
import { ChecklistPreview } from './ChecklistPreview.js'
import { StatusChip } from './ReminderIcons.js'
import { SectionHeading } from './SectionHeading.js'

export function PastOccurrenceDetail({ occurrence, onUndone }: { occurrence: Occurrence; onUndone: () => void }) {
  const undo = useUndoDoneOccurrence()
  const { timeFormat } = useSettings()
  const { user } = useAuth()
  const body = reminderPreviewBody(occurrence.reminder)
  return (
    <Stack spacing={1.5}>
      <SectionHeading title={occurrence.reminder.title} subtitle={formatWhen(occurrence.scheduledFor, timeFormat, user?.timeZone)} />
      <StatusChip status={occurrence.status} />
      {body && <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>{body}</Typography>}
      <ChecklistPreview reminder={occurrence.reminder} checkedItemIds={occurrence.checkedItemIds} />
      {occurrence.status === 'ACKNOWLEDGED' && occurrence.acknowledgedAt && (
        <>
          <Typography level="body-sm">Marked done by mistake? Return it to Current and resume reminders. Your checklist and schedule stay unchanged.</Typography>
          <Button
            variant="outlined"
            color="neutral"
            loading={undo.isPending}
            sx={{ alignSelf: { sm: 'flex-end' }, minHeight: 44 }}
            onClick={() => undo.mutate({ id: occurrence.id, arg: { acknowledgedAt: occurrence.acknowledgedAt! } }, { onSuccess: onUndone })}
          >
            Undo done
          </Button>
        </>
      )}
    </Stack>
  )
}
