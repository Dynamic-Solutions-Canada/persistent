/**
 * "Reset this device" (CONF-4): puts this device's preferences back to their
 * defaults, from the About card.
 *
 * It clears only the keys `lib/deviceStorage.ts` marks as preferences, and keeps
 * the sign-in identity and offline data, then reloads so every provider starts
 * from defaults instead of writing its in-memory copy straight back. Settings a
 * native host keeps itself are out of reach here and are not touched.
 */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useState } from 'react'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import Button from '@mui/joy/Button'
import ModalDialog from '@mui/joy/ModalDialog'
import DialogTitle from '@mui/joy/DialogTitle'
import DialogContent from '@mui/joy/DialogContent'
import { DEVICE_STORAGE_KEYS } from '../lib/deviceStorage.js'
import { BackAwareModal } from './BackAwareModal.js'

/** Joy UI also remembers the colour scheme per mode under these prefixes. */
const JOY_SCHEME_PREFIX = 'joy-color-scheme'

/** Remove every preference key, leaving session and cache keys in place. */
function clearDevicePreferences(storage: Storage): void {
  for (const entry of DEVICE_STORAGE_KEYS) {
    if (entry.kind === 'preference') storage.removeItem(entry.key)
  }
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index)
    if (key?.startsWith(JOY_SCHEME_PREFIX)) storage.removeItem(key)
  }
}

export function ResetDeviceSection() {
  useTranslation()
  const [open, setOpen] = useState(false)

  function onReset() {
    try {
      clearDevicePreferences(localStorage)
    } finally {
      window.location.reload()
    }
  }

  return (
    <Stack spacing={1.5}>
      <Typography level="title-sm">{tr('about.reset.title')}</Typography>
      <Typography level="body-sm">{tr('about.reset.description')}</Typography>
      <Button
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{ alignSelf: 'flex-start' }}
      >
        {tr('about.reset.button')}
      </Button>

      <BackAwareModal open={open} onClose={() => setOpen(false)}>
        <ModalDialog
          variant="outlined"
          role="alertdialog"
          sx={{ maxWidth: 440 }}
        >
          <DialogTitle>{tr('about.reset.question')}</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Typography level="body-sm">
                {tr('about.reset.cleared')}
              </Typography>
              <Typography level="body-sm">{tr('about.reset.kept')}</Typography>
              <Typography level="body-sm">
                {tr('about.reset.native')}
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                sx={{ justifyContent: 'flex-end' }}
              >
                <Button
                  variant="plain"
                  color="neutral"
                  onClick={() => setOpen(false)}
                >
                  {tr('Cancel')}
                </Button>
                <Button onClick={onReset}>{tr('about.reset.confirm')}</Button>
              </Stack>
            </Stack>
          </DialogContent>
        </ModalDialog>
      </BackAwareModal>
    </Stack>
  )
}
