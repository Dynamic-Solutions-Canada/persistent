/**
 * Publishes a bounded, display-ready Upcoming snapshot to the Windows host.
 * The widget is deliberately read-only: selecting it returns to the hosted app,
 * where authentication and reminder actions already have one implementation.
 */
import { tr } from '../localization/i18n.js'
import { useEffect } from 'react'
import { reminderBodyText, type ReminderType } from '@persistent/shared'
import { useReminders } from '../data/reminders.js'
import { useActiveOccurrences } from '../data/occurrences.js'
import { formatWhen } from '../lib/datetime.js'
import { selectUpcomingReminders } from '../lib/upcomingReminders.js'
import { useSettings } from '../settings/useSettings.js'
import { useStartupDataReady } from '../components/startupDataContext.js'
import {
  desktopPlatform,
  onHostMessage,
  publishWidgetSnapshot,
  type WidgetSnapshot
} from './desktopBridge.js'

const WidgetItemLimit = 4

const TypeLabels: Record<ReminderType, string> = {
  NONE: 'REMINDER',
  TODO: 'TO-DO',
  MEDICATION: 'MEDICATION'
}

/** Convert full reminder DTOs into the only strings the native widget needs. */
function makeSnapshot(
  reminders: NonNullable<ReturnType<typeof useReminders>['data']>,
  active: NonNullable<ReturnType<typeof useActiveOccurrences>['data']>,
  timeFormat: ReturnType<typeof useSettings>['timeFormat']
): WidgetSnapshot {
  const items = selectUpcomingReminders(reminders, active)
    .slice(0, WidgetItemLimit)
    .map(({ reminder, next }) => ({
      type: tr(TypeLabels[reminder.type]),
      title: reminder.title,
      description: reminderBodyText(reminder),
      when: next ? formatWhen(next, timeFormat) : tr('Paused'),
      paused: !reminder.active
    }))

  return {
    version: 1,
    signedIn: true,
    generatedAt: new Date().toISOString(),
    items
  }
}

/** Keep the Windows widget cache current while the authenticated app is mounted. */
export function DesktopWidgetSync() {
  const dataReady = useStartupDataReady()
  const reminders = useReminders()
  const active = useActiveOccurrences()
  const { timeFormat, locale, formattingLocale } = useSettings()
  const reminderData = reminders.data
  const activeData = active.data
  const refetchReminders = reminders.refetch
  const refetchActive = active.refetch

  useEffect(() => {
    if (!dataReady || desktopPlatform() !== 'windows' || !reminderData || !activeData) return
    publishWidgetSnapshot(makeSnapshot(reminderData, activeData, timeFormat))
  }, [activeData, reminderData, timeFormat, dataReady, locale, formattingLocale])

  useEffect(
    () => {
      if (desktopPlatform() !== 'windows') return
      return onHostMessage((message) => {
        if (message.type !== 'refreshWidgetSnapshot') return
        void (async () => {
          const [freshReminders, freshActive] = await Promise.all([refetchReminders(), refetchActive()])
          if (!freshReminders.data || !freshActive.data) return
          publishWidgetSnapshot(makeSnapshot(freshReminders.data, freshActive.data, timeFormat))
        })()
      })
    },
    [refetchActive, refetchReminders, timeFormat, locale, formattingLocale]
  )

  return null
}
