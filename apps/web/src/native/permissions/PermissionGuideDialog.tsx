/**
 * The permission guide wired to Android: live readiness (re-read on resume) and
 * the real prompt and settings launches. See `PermissionGuideDialogContent`.
 */
import { launchGrant } from './launchGrant.js'
import { PermissionGuideDialogContent, type PermissionGuideDialogProps } from './PermissionGuideDialogContent.js'
import { useAlarmReadiness } from './useAlarmReadiness.js'

export type { PermissionGuideOutcome } from './PermissionGuideDialogContent.js'

/** Mount to open the guide over `scope`; `onClose` fires once when it finishes or is dismissed. */
export function PermissionGuideDialog({ scope, onClose }: PermissionGuideDialogProps) {
  const { readiness, refresh } = useAlarmReadiness()
  return <PermissionGuideDialogContent scope={scope} onClose={onClose} readiness={readiness} refresh={refresh} launch={launchGrant} />
}
