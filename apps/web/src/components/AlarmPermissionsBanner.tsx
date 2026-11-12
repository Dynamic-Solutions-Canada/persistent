/**
 * Persistent warning for missing Android alarm grants.
 *
 * Red while anything critical is missing (an alarm could ring unseen, late, or
 * collapsed into a banner); a softer warning when only the battery exemption
 * remains, which makes background behavior less dependable but never hides an alarm.
 *
 * These are the grants that decide whether a fired alarm can actually reach the
 * user, and every one of them fails *silently*: the app looks fine until an
 * alarm doesn't. So this banner is deliberately not dismissible: it stays until
 * the permission is granted, which is the only thing that should make it go away.
 *
 * Each button opens the permission guide for that one grant, which explains it
 * before anything leaves the app. Readiness is re-read on resume, so returning
 * from system settings updates the banner without a restart. No-op on the web and
 * on Android versions where a grant isn't needed (the native side reports those
 * as satisfied, and grants an older host doesn't report never show here).
 */
import { tr } from '../localization/i18n.js'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import Alert from '@mui/joy/Alert'
import Box from '@mui/joy/Box'
import Button from '@mui/joy/Button'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { ALARM_GRANTS, grantCopy, missingGrants, type AlarmGrant } from '../native/permissions/alarmGrants.js'
import { PermissionGuideDialog } from '../native/permissions/PermissionGuideDialog.js'
import { useAlarmReadiness } from '../native/permissions/useAlarmReadiness.js'

/** The banner reports every grant the app asks for. */
const BANNER_GRANTS: readonly AlarmGrant[] = ALARM_GRANTS.map((entry) => entry.grant)

/**
 * The banner's heading. Any critical gap keeps the original alarm wording; when
 * only reliability gaps remain, the heading says so instead of claiming alarms
 * are broken.
 */
function bannerTitle(missing: readonly AlarmGrant[], critical: boolean): string {
  if (!critical) return tr("Alarms may be less reliable")
  if (missing.length === 1) return tr("Alarms are not fully set up")
  return tr("{{v0}} things are limiting your alarms", { v0: missing.length })
}

/** The alarm-readiness warning at the top of the signed-in shell; renders nothing when every grant is held. */
export function AlarmPermissionsBanner() {
  useTranslation()
  const { readiness, refresh } = useAlarmReadiness()
  const [guiding, setGuiding] = useState<AlarmGrant | null>(null)

  const missing = readiness ? missingGrants(readiness, BANNER_GRANTS) : []
  const critical = missing.some((grant) => grantCopy(grant).severity === 'critical')
  const color = critical ? 'danger' : 'warning'

  return (
    <>
      {missing.length > 0 && (
        <Alert
          color={color}
          variant="soft"
          startDecorator={<WarningAmberIcon />}
          sx={{ mb: 2, alignItems: 'flex-start' }}
        >
          <Box>
            <Typography level="title-sm">
              {bannerTitle(missing, critical)}
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              {missing.map((grant) => (
                <Box key={grant}>
                  <Typography level="body-sm">{tr(grantCopy(grant).consequence)}</Typography>
                  <Button size="sm" color={color} variant="solid" sx={{ mt: 0.5 }} onClick={() => setGuiding(grant)}>
                    {tr(grantCopy(grant).title)}
                  </Button>
                </Box>
              ))}
            </Stack>
          </Box>
        </Alert>
      )}
      {guiding && (
        <PermissionGuideDialog
          scope={[guiding]}
          onClose={() => {
            setGuiding(null)
            void refresh()
          }}
        />
      )}
    </>
  )
}
