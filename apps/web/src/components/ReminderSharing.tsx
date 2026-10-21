/** Sharing dialog for both a new reminder's draft and an existing owner's grants. */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useState } from 'react'
import ModalDialog from '@mui/joy/ModalDialog'
import DialogTitle from '@mui/joy/DialogTitle'
import DialogContent from '@mui/joy/DialogContent'
import DialogActions from '@mui/joy/DialogActions'
import Stack from '@mui/joy/Stack'
import Autocomplete from '@mui/joy/Autocomplete'
import Button from '@mui/joy/Button'
import Typography from '@mui/joy/Typography'
import Divider from '@mui/joy/Divider'
import { shareInputSchema, type ShareInput } from '@persistent/shared'
import { extractErrorMessage } from '../localization/errorMessage.js'
import { useAuth } from '../auth/useAuth.js'
import {
  useReminderShares,
  useRemoveReminderShare,
  useResendShareInvitation,
  useSaveReminderShare,
  useShareRecipients
} from '../data/shares.js'
import { BackAwareModal } from './BackAwareModal.js'
import { LeaveReminderButton } from './LeaveReminderButton.js'
import { useToast } from './ToastProvider.js'

interface ReminderSharingProps {
  open: boolean
  onClose: () => void
  onLeave?: () => void
  reminderId?: string
  draftShares?: ShareInput[]
  onDraftSharesChange?: (shares: ShareInput[]) => void
  draftMode?: 'share' | 'assign'
  onDraftModeChange?: (mode: 'share' | 'assign') => void
  draftAssignee?: string
  onDraftAssigneeChange?: (email: string) => void
}

export function ReminderSharing({
  open,
  onClose,
  onLeave,
  reminderId,
  draftShares = [],
  onDraftSharesChange,
  draftMode = 'share',
  onDraftModeChange,
  draftAssignee = '',
  onDraftAssigneeChange
}: ReminderSharingProps) {
  useTranslation()
  const { user } = useAuth()
  const shares = useReminderShares(reminderId ?? '')
  const recipients = useShareRecipients()
  const save = useSaveReminderShare(reminderId ?? '')
  const remove = useRemoveReminderShare(reminderId ?? '')
  const resend = useResendShareInvitation(reminderId ?? '')
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  /** New reminders retain draft grants; existing reminders apply them immediately. */
  async function addRecipient(): Promise<boolean> {
    const parsed = shareInputSchema.safeParse({ email, permission: 'EDIT' })
    if (!parsed.success) {
      setError(tr("Enter a valid email address."))
      return false
    }
    if (parsed.data.email === user?.email.toLowerCase()) {
      setError(tr("You already have access."))
      return false
    }
    setError(null)

    if (!reminderId && draftMode === 'assign') {
      onDraftAssigneeChange?.(parsed.data.email)
      setEmail('')
      return true
    }

    if (!reminderId) {
      if (draftShares.length >= 20 && !draftShares.some((share) => share.email === parsed.data.email)) {
        setError(tr("You can share with up to 20 people."))
        return false
      }
      onDraftSharesChange?.([
        ...draftShares.filter((share) => share.email !== parsed.data.email),
        parsed.data
      ])
      setEmail('')
      return true
    }

    try {
      await save.mutateAsync(parsed.data)
      setEmail('')
      return true
    } catch (error) {
      setError(extractErrorMessage(error, tr("Couldn't add this person.")))
      return false
    }
  }

  /** Done also commits a typed address, so closing cannot silently discard it. */
  async function finishSharing(): Promise<void> {
    if (email.trim() && !(await addRecipient())) return
    onClose()
  }

  const people = reminderId ? (shares.data?.shares ?? []) : draftShares
  const isOwner = shares.data?.owner.id === user?.id
  const assigning = !reminderId && draftMode === 'assign'

  return (
    <BackAwareModal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 'min(480px, calc(100vw - 32px))', maxHeight: '90dvh', overflowX: 'hidden', overflowY: 'auto' }}>
        <DialogTitle>{reminderId ? tr("Share reminder") : tr("Share or assign reminder")}</DialogTitle>
        <DialogContent sx={{ minWidth: 0, flex: 'none', overflow: 'visible' }}>
          <Stack spacing={1.5}>
            {!reminderId && (
              <Stack direction="row" spacing={1}>
                <Button
                  variant={assigning ? 'outlined' : 'solid'}
                  onClick={() => {
                    onDraftModeChange?.('share')
                    onDraftAssigneeChange?.('')
                    setEmail('')
                    setError(null)
                  }}
                >{tr("Shared")}</Button>
                <Button
                  variant={assigning ? 'solid' : 'outlined'}
                  onClick={() => {
                    onDraftModeChange?.('assign')
                    onDraftSharesChange?.([])
                    setEmail('')
                    setError(null)
                  }}
                >{tr("For someone else")}</Button>
              </Stack>
            )}
            <Typography level="body-sm">
              {assigning
                ? tr("Only the assignee gets alerts and can edit or complete this reminder. You can monitor its status after creation. An invited person starts receiving it after sign-in.")
                : tr("Share with someone who has a Persistent account, or invite them by email. Everyone with access can edit, complete, and share this reminder further. Snooze, de-escalation, and shade prominence are personal.")}
            </Typography>
            <Typography level="title-sm">{assigning ? tr("Assignee") : tr("People with access")}</Typography>
            {assigning ? (
              <Typography level="body-sm">{draftAssignee || tr("Choose one person")}</Typography>
            ) : (
            <>
            {reminderId && shares.isLoading ? (
              <Typography level="body-sm">{tr("Loading access...")}</Typography>
            ) : reminderId && shares.isError ? (
              <Typography level="body-sm" color="danger">{tr("Could not load access.")}</Typography>
            ) : !reminderId && people.length === 0 ? (
              <Typography level="body-sm">{tr("Only you")}</Typography>
            ) : null}
            {reminderId && shares.data?.owner && (
              <Typography level="body-sm" sx={{ overflowWrap: 'anywhere' }}><Trans i18nKey={"<v0/> (owner<v1/>)"} components={{ v0: <>{shares.data.owner.displayName || shares.data.owner.email}</>, v1: <>{isOwner ? ', you' : ''}</> }} /></Typography>
            )}
            {reminderId
              ? shares.data?.shares.map((share) => (
                  <Stack key={share.email} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography level="body-sm" sx={{ flex: 1, minWidth: 120, overflowWrap: 'anywhere' }}>
                      {share.displayName || share.email}{share.recipientId === user?.id ? tr(" (you)") : ''}{share.pending ? tr(" (invited)") : ''}
                    </Typography>
                    {share.pending && share.canRemove && (
                      <Button
                        size="sm"
                        variant="plain"
                        loading={resend.isPending}
                        onClick={() => resend.mutate(share.email, { onSuccess: () => toast(tr("Invitation sent")) })}
                      >{tr("Resend")}</Button>
                    )}
                    {share.canRemove && (
                      <Button
                        size="sm"
                        variant="plain"
                        color="danger"
                        disabled={save.isPending || remove.isPending}
                        onClick={() => remove.mutate(share)}
                      >{tr("Remove")}</Button>
                    )}
                  </Stack>
                ))
              : draftShares.map((share) => (
                  <Stack key={share.email} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography level="body-sm" sx={{ flex: 1, minWidth: 120, overflowWrap: 'anywhere' }}>
                      {share.email}
                    </Typography>
                    <Button
                      size="sm"
                      variant="plain"
                      color="danger"
                      onClick={() => onDraftSharesChange?.(draftShares.filter((person) => person.email !== share.email))}
                    >{tr("Remove")}</Button>
                  </Stack>
                ))}
            </>
            )}
            <Divider />
            <Typography level="title-sm">{assigning ? tr("Choose assignee") : tr("Add someone")}</Typography>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <Autocomplete
                freeSolo
                autoComplete
                options={recipients.data ?? []}
                value={email}
                inputValue={email}
                onChange={(_event, value) => { setEmail(value ?? ''); setError(null) }}
                onInputChange={(_event, value) => { setEmail(value); setError(null) }}
                onKeyDown={(event) => {
                  const choosingSuggestion = event.target instanceof HTMLInputElement &&
                    event.target.getAttribute('aria-expanded') === 'true'
                  if (event.key === 'Enter' && !choosingSuggestion) {
                    event.preventDefault()
                    void addRecipient()
                  }
                }}
                placeholder={tr("Their email address")}
                aria-label={tr("Their email address")}
                sx={{ flex: 1, minWidth: 0 }}
              />
              <Button onClick={() => void addRecipient()} loading={save.isPending} sx={{ whiteSpace: 'nowrap' }}>
                {assigning ? tr("Set assignee") : tr("Add person")}
              </Button>
            </Stack>
            {error && <Typography color="danger" level="body-sm">{error}</Typography>}
            {reminderId && shares.data && !isOwner && (
              <LeaveReminderButton reminderId={reminderId} onLeft={() => {
                onClose()
                onLeave?.()
              }} />
            )}
            {!reminderId && !assigning && draftShares.length > 0 && (
              <Typography level="body-xs">{tr("Access or invitations will be sent when you create the reminder.")}</Typography>
            )}
            {assigning && draftAssignee && (
              <Typography level="body-xs">{tr("The assignment will be created when you save the reminder.")}</Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="plain" color="neutral" disabled={save.isPending || remove.isPending} onClick={() => void finishSharing()}>{tr("Done")}</Button>
        </DialogActions>
      </ModalDialog>
    </BackAwareModal>
  )
}
