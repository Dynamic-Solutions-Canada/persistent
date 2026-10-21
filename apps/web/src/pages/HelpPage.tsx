/**
 * Help / how it works. Plain-language explanation of the persistence model and
 * the Done/De-escalate/Snooze actions (the user-facing side of
 * docs/notification-behavior.md), plus the basics of creating reminders. Reached
 * from the top-bar help icon and a link in Settings.
 */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Stack from '@mui/joy/Stack'
import Card from '@mui/joy/Card'
import Typography from '@mui/joy/Typography'
import Chip from '@mui/joy/Chip'
import Link from '@mui/joy/Link'
import { SectionHeading } from '../components/SectionHeading.js'
import { isNative } from '../native/alarmBridge.js'
import { desktopPlatform, isDesktopHost } from '../native/desktopBridge.js'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined">
      <Typography level="title-sm">{title}</Typography>
      {children}
    </Card>
  )
}

/** Explain the notification capability of the host currently rendering Help. */
function NotificationsOnThisDevice() {
  useTranslation()
  if (isNative()) {
    return (
      <Section title={tr("Permissions on this device")}>
        <Typography level="body-sm"><Trans i18nKey={"For alarms to ring reliably, Android needs permission to schedule exact alarms, to show full-screen alarms, and to ignore battery optimizations for Persistent. You can set notification and alarm sounds and the default shade prominence in <c0>Settings</c0>."} components={{ c0: <Link component={RouterLink} to="/settings" /> }} /></Typography>
      </Section>
    )
  }

  if (isDesktopHost()) {
    return (
      <Section title={tr(desktopPlatform() === 'linux' ? 'Linux notifications' : 'Windows notifications')}>
        <Typography level="body-sm"><Trans i18nKey={"The desktop companion keeps notifications visible, restores them after dismissal, repeats configured nags, and loops alarm audio for Alarm reminders and escalations. Done, Snooze, and De-escalate work directly from the notification. This requires the PC to be awake with Persistent running; it catches up after reconnecting but cannot wake a sleeping or shut-down PC. Turn it on in <c0>Settings</c0>."} components={{ c0: <Link component={RouterLink} to="/settings" /> }} /></Typography>
      </Section>
    )
  }

  return (
    <Section title={tr("Notifications require an app")}>
      <Typography level="body-sm"><Trans i18nKey={"The browser is for managing reminders and does not send notifications. Install the Android app for reliable alarms, or the Windows companion for persistent alerts while your PC is awake. Both are linked in <c0>Settings</c0>."} components={{ c0: <Link component={RouterLink} to="/settings" /> }} /></Typography>
    </Section>
  )
}

export function HelpPage() {
  useTranslation()
  return (
    <Stack spacing={1.5}>
      <SectionHeading title={tr("Help")} subtitle={tr("How Persistent behaves, and what each setting does.")} />

      <Section title={tr("What Persistent does")}>
        <Typography level="body-sm"><Trans i18nKey={"Persistent is a reminder that doesn't give up. When a reminder is due it <c0>sends you a notification</c0>. If you don't confirm it, it keeps <c1>nagging</c1>, the notification comes back (and can re-sound, or ring as a full alarm), until you <c2>explicitly mark it done</c2>. Swiping it away isn't enough; that's the whole point."} components={{ c0: <b />, c1: <b />, c2: <b /> }} /></Typography>
      </Section>

      <Section title={tr("Creating a reminder")}>
        <Typography level="body-sm"><Trans i18nKey={"Tap <c0>New</c0> on the Reminders screen. Give it a title, pick a type if you like (Checklist), and set a schedule: a one-off time, or a repeat (daily, certain weekdays, monthly on the days you choose, every N days) with one or more times of day. Add optional details, anything you want to see on the notification itself."} components={{ c0: <b /> }} /></Typography>
      </Section>

      <Section title={tr("Notes, things that don't remind you")}>
        <Typography level="body-sm"><Trans i18nKey={"On the <c0>Schedule</c0> tab, <c1>Never, just a note</c1> keeps something in the app without ever reminding you about it: a door code, a packing list, what the vet said. A note never notifies you, never nags and never needs confirming, it just sits on the <c2>Notes</c2> tab, which appears as soon as you have one, where you can read it whenever you need it, checklist and all, a note's items tick off right there, and stay ticked until you untick them (there is no firing to reset them). You can give it a real schedule later if it turns out you do want reminding; that clears the ticks, because from then on each notification tracks its own. Doing it the other way round, turning a reminder into a note, clears anything it had left waiting for you."} components={{ c0: <b />, c1: <b />, c2: <b /> }} /></Typography>
      </Section>

      <Section title={tr("Checklists")}>
        <Typography level="body-sm"><Trans i18nKey={"A <c0>Checklist</c0> reminder covers several things at once, a morning routine, a packing list, everything to lock up at night. Add the items when you create it, then tick them off as you go. Each notification has its own ticks, so a repeating checklist starts fresh every time. Ticking everything does <c1>not</c1> confirm the reminder: it keeps nagging until you tap <c2>Done</c2>, exactly like any other reminder."} components={{ c0: <b />, c1: <b />, c2: <b /> }} /></Typography>
      </Section>

      <Section title={tr("Monthly reminders")}>
        <Typography level="body-sm"><Trans i18nKey={"Pick <c0>Monthly</c0> and choose the days it should notify you on, the 1st, the 1st and the 15th, whatever you need. A month that doesn't have the day you picked is skipped rather than moved, so a reminder set for the 31st stays silent in February. For the end of every month regardless of length, tick <c1>Last day of the month</c1> instead."} components={{ c0: <b />, c1: <b /> }} /></Typography>
      </Section>

      <Section title={tr("How hard it nags: Persistent vs Alarm")}>
        <Typography level="body-sm"><Trans i18nKey={"<c0>Persistent</c0> is a notification that re-appears until you confirm it, and can repeat a sound on an interval you choose. <c1>Alarm</c1> goes further: a looping sound and vibration that takes over the screen and can't be dismissed, only Done or Snooze clears it. Choose Alarm for things you must not sleep through."} components={{ c0: <b />, c1: <b /> }} /></Typography>
      </Section>

      <Section title={tr("Escalation")}>
        <Typography level="body-sm"><Trans i18nKey={"A Persistent reminder can <c0>escalate to an alarm</c0> if you ignore it, either after a number of minutes, or at a specific time of day. You can also set an <c1>email contact</c1> to be notified once a reminder is overdue, as a backstop in case you miss it on all your devices. (Alarm reminders already ring continuously, so they don't escalate.)"} components={{ c0: <b />, c1: <b /> }} /></Typography>
      </Section>

      <Section title={tr("Done, De-escalate, and Snooze")}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Chip size="sm" color="success" variant="soft">{tr("Done")}</Chip>
            <Typography level="body-sm"><Trans i18nKey={"Marks the reminder complete and clears it <c0>everywhere</c0>, the alarm stops and the notification disappears on all your devices. This is the only action that ends the nag for good. To avoid an accidental tap, Done asks you to <c1>confirm</c1> once before it counts."} components={{ c0: <b />, c1: <b /> }} /></Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Chip size="sm" color="warning" variant="soft">{tr("De-escalate")}</Chip>
            <Typography level="body-sm"><Trans i18nKey={"Appears on an escalated alarm. It <c0>stops the alarm but keeps the reminder nagging</c0> as the ordinary notification it was before escalating, it won't ring again for this notification, but it still isn't done. “Stop yelling, but keep reminding me.”"} components={{ c0: <b /> }} /></Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Chip size="sm" color="neutral" variant="soft">{tr("Snooze")}</Chip>
            <Typography level="body-sm"><Trans i18nKey={"Hides the reminder for a while and brings it back later. If it was ringing as an alarm, it rings again when the snooze ends, snoozing snoozes the alarm itself, it doesn't quietly downgrade it. On a card it's the <c0>clock icon</c0> beside Done; Done keeps its name because it's the one action that ends the nag."} components={{ c0: <b /> }} /></Typography>
          </Stack>
        </Stack>
      </Section>

      <Section title={tr("Reminders with several times repeat independently")}>
        <Typography level="body-sm"><Trans i18nKey={"Each notification a reminder sends is its own item. If a reminder fires at 9:00 and 1:00 and you haven't confirmed the 9:00 one when 1:00 comes around, you'll see <c0>both</c0>, each with its own Done, and you confirm them <c1>separately</c1>. Marking the 1:00 one done never silently clears the 9:00 one, so a firing you missed is never lost."} components={{ c0: <b />, c1: <b /> }} /></Typography>
      </Section>

      <Section title={tr("History")}>
        <Typography level="body-sm"><Trans i18nKey={"The <c0>History</c0> tab lists past notifications, what you confirmed and when, so you can check whether something was actually done."} components={{ c0: <b /> }} /></Typography>
      </Section>

      <NotificationsOnThisDevice />
    </Stack>
  )
}
