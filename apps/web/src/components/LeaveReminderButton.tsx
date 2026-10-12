/** Leaving removes only the member's grant; it never completes or deletes the reminder. */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@mui/joy/Button'
import ModalDialog from '@mui/joy/ModalDialog'
import DialogTitle from '@mui/joy/DialogTitle'
import DialogActions from '@mui/joy/DialogActions'
import Typography from '@mui/joy/Typography'
import { BackAwareModal } from './BackAwareModal.js'
import { useLeaveSharedReminder } from '../data/shares.js'

/** Confirm before giving up access; close the calling sharing surface after success. */
export function LeaveReminderButton({ reminderId, onLeft }: { reminderId: string; onLeft: () => void }) {
  const [open, setOpen] = useState(false)
  const leave = useLeaveSharedReminder()
  const navigate = useNavigate()
  return <>
    <Button variant="plain" color="danger" sx={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Leave reminder</Button>
    <BackAwareModal open={open} onClose={() => setOpen(false)}>
      <ModalDialog sx={{ width: 'min(400px, calc(100vw - 32px))' }}>
        <DialogTitle>Leave shared reminder?</DialogTitle>
        <Typography level="body-sm">You will lose access. The reminder will stay with its owner and other members.</Typography>
        <DialogActions>
          <Button variant="plain" color="neutral" onClick={() => setOpen(false)}>Cancel</Button>
          <Button color="danger" loading={leave.isPending} onClick={() => leave.mutate(reminderId, { onSuccess: () => {
            setOpen(false)
            onLeft()
            navigate('/')
          } })}>Leave reminder</Button>
        </DialogActions>
      </ModalDialog>
    </BackAwareModal>
  </>
}
