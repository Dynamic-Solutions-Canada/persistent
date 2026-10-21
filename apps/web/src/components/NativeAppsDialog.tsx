/** Native download chooser opened by the web title bar's "Get the app" action. */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import Button from '@mui/joy/Button'
import DialogActions from '@mui/joy/DialogActions'
import DialogContent from '@mui/joy/DialogContent'
import DialogTitle from '@mui/joy/DialogTitle'
import ModalDialog from '@mui/joy/ModalDialog'
import Typography from '@mui/joy/Typography'
import { BackAwareModal } from './BackAwareModal.js'
import { NativeAppButtons } from './NativeAppButtons.js'

export interface NativeAppsDialogProps {
  open: boolean
  onClose(): void
}

/** Present all native apps without treating a platform as the default. */
export function NativeAppsDialog({ open, onClose }: NativeAppsDialogProps) {
  useTranslation()
  return (
    <BackAwareModal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 'min(400px, calc(100vw - 32px))' }}>
        <DialogTitle>{tr("Get Persistent")}</DialogTitle>
        <DialogContent>
          <Typography level="body-sm">{tr("Android can sound alarms even while offline. The Windows and Linux apps add tray access and persistent notifications with alarm audio while your computer is awake. Windows also offers an upcoming widget.")}</Typography>
          <NativeAppButtons />
        </DialogContent>
        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>{tr("Close")}</Button>
        </DialogActions>
      </ModalDialog>
    </BackAwareModal>
  )
}
