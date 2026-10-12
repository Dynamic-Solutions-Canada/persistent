/** Store chooser opened by the web title bar's "Get the app" action. */
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

/** Present all native apps without treating either platform as the default. */
export function NativeAppsDialog({ open, onClose }: NativeAppsDialogProps) {
  return (
    <BackAwareModal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 'min(400px, calc(100vw - 32px))' }}>
        <DialogTitle>Get Persistent</DialogTitle>
        <DialogContent>
          <Typography level="body-sm">
            Android can sound alarms even while offline. The Windows and Linux apps add tray access and
            persistent notifications with alarm audio while your computer is awake. Windows also offers an upcoming widget.
          </Typography>
          <NativeAppButtons />
        </DialogContent>
        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </ModalDialog>
    </BackAwareModal>
  )
}
