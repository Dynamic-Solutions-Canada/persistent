/** Show the retired direct-build migration notice once per installation, keeping Settings guidance available. */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useState } from 'react'
import ModalDialog from '@mui/joy/ModalDialog'
import DialogTitle from '@mui/joy/DialogTitle'
import DialogContent from '@mui/joy/DialogContent'
import Button from '@mui/joy/Button'
import Stack from '@mui/joy/Stack'
import { hasNativeUpdater } from './alarmBridge.js'
import { BackAwareModal } from '../components/BackAwareModal.js'
import { DirectBuildNotice } from './DirectBuildNotice.js'
import { PLAY_MIGRATION_NOTICE_SEEN_KEY } from '../lib/deviceStorage.js'

export function DirectBuildMigrationNotice() {
  useTranslation()
  const [open, setOpen] = useState(() => {
    if (!hasNativeUpdater()) return false
    try {
      return localStorage.getItem(PLAY_MIGRATION_NOTICE_SEEN_KEY) !== '1'
    } catch {
      return true
    }
  })

  const dismiss = () => {
    setOpen(false)
    try {
      localStorage.setItem(PLAY_MIGRATION_NOTICE_SEEN_KEY, '1')
    } catch {
      // Storage may be unavailable; dismiss for this session without blocking the app.
    }
  }

  if (!open) return null
  return (
    <BackAwareModal open onClose={dismiss}>
      <ModalDialog>
        <DialogTitle>{tr('A change to Android downloads')}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <DirectBuildNotice />
          </Stack>
        </DialogContent>
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
          <Button variant="plain" color="neutral" onClick={dismiss}>
            {tr('Later')}
          </Button>
        </Stack>
      </ModalDialog>
    </BackAwareModal>
  )
}
