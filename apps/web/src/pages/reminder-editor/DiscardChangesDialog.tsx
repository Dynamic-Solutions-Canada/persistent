/**
 * "You have unsaved changes" prompt, shown when leaving the editor would drop
 * them — Back on Android, or Cancel anywhere.
 *
 * Built on BackAwareModal so Back closes the prompt itself rather than leaving the
 * screen: the press that raised the question must not also answer it.
 */
import { useTranslation } from 'react-i18next'
import { tr } from '../../localization/i18n.js'
import ModalDialog from '@mui/joy/ModalDialog'
import DialogTitle from '@mui/joy/DialogTitle'
import DialogContent from '@mui/joy/DialogContent'
import Stack from '@mui/joy/Stack'
import Button from '@mui/joy/Button'
import { BackAwareModal } from '../../components/BackAwareModal.js'

export function DiscardChangesDialog({
  open,
  onKeepEditing,
  onDiscard
}: {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}) {
  useTranslation()
  return (
    <BackAwareModal open={open} onClose={onKeepEditing}>
      <ModalDialog variant="outlined">
        <DialogTitle>{tr("Discard changes?")}</DialogTitle>
        <DialogContent>{tr("Your edits to this reminder haven't been saved.")}</DialogContent>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          {/* Keep editing leads, and is the plain-Enter default: discarding is the
              destructive one, so it should take a deliberate tap. */}
          <Button variant="solid" onClick={onKeepEditing} sx={{ flex: 1 }} autoFocus>{tr("Keep editing")}</Button>
          <Button variant="plain" color="danger" onClick={onDiscard}>{tr("Discard")}</Button>
        </Stack>
      </ModalDialog>
    </BackAwareModal>
  )
}
