/**
 * The first-run permission guide on Android: after sign-in, walk through every
 * missing alarm grant once, one at a time (see `PermissionGuideDialog`).
 *
 * It waits for startup data and for any other dialog (a notification deep link, the
 * migration notice) so it never stacks on top of one, and it reserves the dialog
 * slot as soon as it decides to open so nothing else opens in between. Grants it
 * has shown are remembered per device, so a later launch shows it again only for a
 * grant this device never saw explained; anything put off stays in the alarm banner.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import {
  hasPendingBackAwareDialog,
  reserveBackAwareDialog,
  subscribeBackAwareDialogs
} from '../../components/backAwareDialogStack.js'
import { useStartupDataReady } from '../../components/startupDataContext.js'
import type { AlarmGrant } from './alarmGrants.js'
import { grantsToOffer, readOfferedGrants, recordOfferedGrants } from './guideOffers.js'
import { PermissionGuideDialog } from './PermissionGuideDialog.js'
import { useAlarmReadiness } from './useAlarmReadiness.js'

/** Mounted once in the signed-in shell; renders nothing on the web or when nothing new is missing. */
export function PermissionOnboarding() {
  const ready = useStartupDataReady()
  const { pathname } = useLocation()
  const otherDialogOpen = useSyncExternalStore(subscribeBackAwareDialogs, hasPendingBackAwareDialog, () => false)
  const { readiness } = useAlarmReadiness()
  const [scope, setScope] = useState<AlarmGrant[] | null>(null)
  // Offer at most once per app session; the next launch re-evaluates.
  const [considered, setConsidered] = useState(false)
  const releaseSlot = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (considered || !readiness || !ready || otherDialogOpen) return
    // Another automatic dialog can register in this same commit.
    if (hasPendingBackAwareDialog()) return
    // A tapped notification is opening a reminder; that comes first.
    if (pathname.startsWith('/reminders/') || pathname.startsWith('/shared/')) return

    setConsidered(true)
    const offer = grantsToOffer(readiness, readOfferedGrants())
    if (offer.length === 0) return

    // Hold the slot until the guide closes; its modal registers a render later.
    releaseSlot.current = reserveBackAwareDialog()
    setScope(offer)
  }, [considered, readiness, ready, otherDialogOpen, pathname])

  // Never leave the slot held if the shell unmounts (sign-out) mid-guide.
  useEffect(() => () => releaseSlot.current?.(), [])

  if (!scope) return null
  return (
    <PermissionGuideDialog
      scope={scope}
      onClose={({ shown }) => {
        // Only grants the user actually saw explained count as offered; one the guide
        // never reached (closed early with Back) is offered again next launch.
        // Recorded on close, not open: if Android kills the app while the user is in
        // settings, the guide resumes next launch with whatever is still missing.
        recordOfferedGrants(shown)
        releaseSlot.current?.()
        releaseSlot.current = null
        setScope(null)
      }}
    />
  )
}
