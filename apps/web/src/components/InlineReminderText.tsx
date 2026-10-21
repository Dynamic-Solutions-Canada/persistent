/** Text in the reading dialog that becomes a small editor only when selected. */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useEffect, useRef, useState } from 'react'
import Box from '@mui/joy/Box'
import Button from '@mui/joy/Button'
import Input from '@mui/joy/Input'
import Textarea from '@mui/joy/Textarea'
import Typography from '@mui/joy/Typography'
import { extractErrorMessage } from '../localization/errorMessage.js'

export function InlineReminderText({
  text,
  kind,
  onSave
}: {
  text: string
  kind: 'title' | 'body'
  onSave: (text: string, expectedText: string) => void | Promise<unknown>
}) {
  useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const baseline = useRef(text)
  const saving = useRef(false)
  const [pending, setPending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const finished = useRef(false)
  const label = tr(kind === 'title' ? 'Edit reminder title' : 'Edit note body')

  useEffect(() => {
    if (!editing) setDraft(text)
  }, [text, editing])

  async function commit() {
    if (saving.current) return
    if (finished.current) return
    finished.current = true
    const next = draft.trim()
    if (kind === 'title' && !next) {
      setDraft(text)
      setEditing(false)
      return
    }
    if (next === baseline.current) {
      setEditing(false)
      return
    }
    saving.current = true
    setPending(true)
    try {
      await onSave(next, baseline.current)
      setEditing(false)
    } catch (error) {
      finished.current = false
      setSaveError(extractErrorMessage(error))
    } finally {
      saving.current = false
      setPending(false)
    }
  }

  function cancel() {
    finished.current = true
    setDraft(text)
    setEditing(false)
  }

  function beginEditing() {
    finished.current = false
    baseline.current = text
    setSaveError(null)
    setEditing(true)
  }

  if (editing) {
    return (
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {kind === 'title' ? (
          <Input
            disabled={pending}
            autoFocus
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setSaveError(null) }}
            onBlur={() => { if (!saveError) void commit() }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                cancel()
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
            }}
            slotProps={{ input: { 'aria-label': label, maxLength: 200 } }}
            sx={{ flex: 1, minWidth: 0, fontSize: 'lg' }}
          />
        ) : (
          <Textarea
            disabled={pending}
            autoFocus
            minRows={3}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setSaveError(null) }}
            onBlur={() => { if (!saveError) void commit() }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                cancel()
              }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                commit()
              }
            }}
            slotProps={{ textarea: { 'aria-label': label, maxLength: 2000 } }}
            sx={{ width: '100%' }}
          />
        )}
        {saveError && <Box>
          <Typography level="body-xs" color="danger" role="alert"><Trans i18nKey={"<v0/> Your draft is kept above."} components={{ v0: <>{saveError}</> }} /></Typography>
          <Button size="sm" variant="plain" color="neutral" onClick={() => {
            setDraft(text)
            setEditing(false)
          }}>{tr("Cancel edit and show latest")}</Button>
        </Box>}
      </Box>
    )
  }

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={beginEditing}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          beginEditing()
        }
      }}
      sx={{
        flex: kind === 'title' ? 1 : undefined,
        minWidth: 0,
        borderRadius: 'sm',
        cursor: 'text',
        '&:hover, &:focus-visible': { bgcolor: 'background.level1', outline: 'none' }
      }}
    >
      <Typography
        level={kind === 'title' ? 'title-lg' : 'body-sm'}
        sx={{ whiteSpace: 'pre-wrap', color: kind === 'body' && !text ? 'text.tertiary' : undefined }}
      >
        {text || tr("Add note")}
      </Typography>
    </Box>
  )
}
