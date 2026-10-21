/** One place to review every reminder shared with this account. */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import { useAuth } from '../auth/useAuth.js'
import { PullToRefresh } from '../components/PullToRefresh.js'
import { ReminderListItem } from '../components/ReminderListItem.js'
import { SectionHeading } from '../components/SectionHeading.js'
import { useReminderDialogs } from '../components/reminderDialogContext.js'
import { useReceivedShares } from '../data/shares.js'
import { formatWhen } from '../lib/datetime.js'
import { useSettings } from '../settings/useSettings.js'

export function ReceivedSharesPage() {
  useTranslation()
  const dialogs = useReminderDialogs()
  const received = useReceivedShares()
  const { user } = useAuth()
  const { timeFormat } = useSettings()

  return (
    <PullToRefresh onRefresh={() => received.refetch().then(() => undefined)}>
      <Stack spacing={1.5}>
        <SectionHeading title={tr("Shared with me")} subtitle={tr("Reminders other people have shared with you.")} />
        {received.isLoading && <Typography level="body-sm">{tr("Loading…")}</Typography>}
        {received.data?.length === 0 && (
          <Typography level="body-sm">{tr("No reminders have been shared with you yet.")}</Typography>
        )}
        {received.data?.map((reminder) => (
          <ReminderListItem
            key={reminder.id}
            onOpen={() => dialogs.view(reminder.id)}
            type={reminder.type}
            title={reminder.title}
            sharing="shared"
            subtitle={tr("From {{v0}}{{v1}}", { v0: reminder.ownerName, v1: reminder.nextScheduledFor
              ? ` · Next: ${formatWhen(reminder.nextScheduledFor, timeFormat, user?.timeZone)}`
              : '' })}
          />
        ))}
      </Stack>
    </PullToRefresh>
  )
}
