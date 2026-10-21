/** Linux notification Snooze uses the existing picker over the current screen, preserving any editor draft. */
import { tr } from '../localization/i18n.js'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { SnoozeDialog } from '../components/SnoozeDialog.js'
import { useToast } from '../components/ToastProvider.js'
import { useStartupDataReady } from '../components/startupDataContext.js'
import { useActiveOccurrences, useSnoozeOccurrence } from '../data/occurrences.js'
import { announceNotificationActions, desktopPlatform, onHostMessage } from './desktopBridge.js'

export function DesktopNotificationSnooze() {
  useTranslation()
  const active = useActiveOccurrences()
  const snooze = useSnoozeOccurrence()
  const ready = useStartupDataReady()
  const toast = useToast()
  const [requested, setRequested] = useState<string | null>(null)
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)

  useEffect(() => {
    if (desktopPlatform() !== 'linux') return
    const unsubscribe = onHostMessage((message) => {
      if (message.type === 'snoozeOccurrence') setRequested(message.occurrenceId)
    })
    // This component exists only inside the authenticated app shell. A startup
    // click waits in the host until this listener is attached, then for the shared
    // freshness gate to finish before the picker reads an account's occurrences.
    announceNotificationActions(true)
    return () => {
      unsubscribe()
      announceNotificationActions(false)
    }
  }, [])

  useEffect(() => {
    if (!ready || !requested || !active.data) return
    if (active.data.some((occurrence) => occurrence.id === requested)) setSnoozeFor(requested)
    else toast(tr("This reminder no longer needs confirmation."), 'neutral')
    setRequested(null)
  }, [ready, requested, active.data, toast])

  return (
    <SnoozeDialog
      open={ready && snoozeFor !== null}
      busy={snooze.isPending}
      reminderTitle={active.data?.find((occurrence) => occurrence.id === snoozeFor)?.reminder.title}
      onClose={() => setSnoozeFor(null)}
      onSnooze={(input) => {
        if (snoozeFor) snooze.mutate({ id: snoozeFor, arg: input })
        setSnoozeFor(null)
      }}
    />
  )
}
