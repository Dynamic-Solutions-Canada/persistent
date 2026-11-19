/**
 * Persistent's dialog: web-app-kit's `BackAwareModal` with the app's one extra policy.
 *
 * The kit owns everything about Back: each open dialog owns a history entry, Back asks the top
 * dialog to close, a declined close keeps its entry, and scrim clicks do not close (UI standard).
 * This wrapper adds only the startup data gate: while `StartupDataGate` reloads data after a
 * connection change, an open dialog is suspended (hidden but not closed), so it keeps its history
 * entry and its editor state and reappears when the data is ready.
 *
 * Every dialog in the app uses this, never Joy's `Modal` directly; the kit's lint rule enforces
 * that.
 */
import {
  BackAwareModal as KitBackAwareModal,
  type BackAwareModalProps,
} from '@dynamic-solutions-canada/web-app-kit'
import { useStartupDataReady } from './startupDataContext.js'

export function BackAwareModal({ suspended, ...props }: BackAwareModalProps) {
  const dataReady = useStartupDataReady()
  return (
    <KitBackAwareModal
      {...props}
      suspended={Boolean(suspended) || !dataReady}
    />
  )
}
