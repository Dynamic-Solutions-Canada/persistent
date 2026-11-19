/**
 * The app's view of the open-dialog stack, for code outside the component tree.
 *
 * web-app-kit owns the stack itself (`hasOpenBackAwareDialog`, `hasPendingBackAwareDialog`,
 * `subscribeBackAwareDialogs`). This module adds the one piece of app policy on top: the
 * automatic-dialog reservation. A dialog that opens by itself (an announcement, the permission
 * guide) only registers with the kit once its modal mounts, which can be a render after it
 * decided to open; without a claim, a sibling deciding in between would open too and the two
 * would stack. So such a dialog reserves the slot as soon as it decides, and the "pending" answer
 * here counts reservations as well as the kit's own state.
 */
import {
  hasOpenBackAwareDialog,
  hasPendingBackAwareDialog as kitHasPendingDialog,
  subscribeBackAwareDialogs as kitSubscribe,
} from '@dynamic-solutions-canada/web-app-kit'

export { hasOpenBackAwareDialog }

let reservations = 0
const listeners = new Set<() => void>()

/** Tell subscribers that the reservation count changed. */
function notifyReservationChange(): void {
  for (const listener of listeners) listener()
}

/**
 * Calls `listener` whenever the kit's stack or a reservation may have changed.
 *
 * @returns A function that stops both subscriptions.
 */
export function subscribeBackAwareDialogs(listener: () => void): () => void {
  listeners.add(listener)
  const stopKit = kitSubscribe(listener)
  return () => {
    listeners.delete(listener)
    stopKit()
  }
}

/**
 * Whether a new automatic dialog should wait: a dialog is open, a closed dialog's history entry
 * is still being removed (the kit's answer), or another automatic dialog has reserved the slot.
 */
export function hasPendingBackAwareDialog(): boolean {
  return kitHasPendingDialog() || reservations > 0
}

/**
 * Claim the automatic-dialog slot from the moment a dialog decides to open until it closes.
 *
 * @returns A release function; calling it more than once is safe.
 */
export function reserveBackAwareDialog(): () => void {
  reservations += 1
  notifyReservationChange()
  let released = false
  return () => {
    if (released) return
    released = true
    reservations -= 1
    notifyReservationChange()
  }
}
