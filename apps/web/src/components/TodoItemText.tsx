/**
 * One checklist item's text in the reading dialog: read it, or click it to rewrite it.
 *
 * The row's three regions each do exactly one thing — the checkbox ticks, this edits,
 * the handle drags — so nothing is guessed from where a tap landed. That is a real
 * trade against what came before, where the whole row ticked: the tick target shrinks
 * to the checkbox, which is why the checkbox keeps a deliberately generous hit area
 * (see `TodoChecklist`). Ticking one-handed against a ringing alarm is still the thing
 * this list is for.
 *
 * Committing is the same shape as the add row: Enter or blur saves, Escape abandons,
 * and an empty or unchanged value saves nothing rather than writing a blank line. The
 * text belongs to the *reminder*, so a rename here is the definition changing — every
 * later firing says the new thing, and the notification body with it.
 */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useEffect, useRef, useState } from 'react'
import Box from '@mui/joy/Box'
import Button from '@mui/joy/Button'
import Input from '@mui/joy/Input'
import Typography from '@mui/joy/Typography'
import { extractErrorMessage } from '../localization/errorMessage.js'
import { checklistItemTextSx } from './checklistItemTextSx.js'
import { MAX_TODO_ITEM_TEXT } from '@persistent/shared'

export function TodoItemText({
  text,
  struck,
  onRename,
  disabled
}: {
  text: string
  /** Ticked: struck through and dimmed, but still legible — the list is the record. */
  struck: boolean
  /**
   * Save new text for this item. Omitted where nothing owns the write (History, or a
   * surface with no reminder to edit), and the text is then plain and inert.
   */
  onRename?: (text: string, expectedText: string) => void | Promise<unknown>
  disabled?: boolean
}) {
  useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const baseline = useRef(text)
  const saving = useRef(false)
  const [pending, setPending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement | null>(null)

  // A rename landing from another device while this row is open would otherwise be
  // overwritten by whatever is half-typed here; closed, the row just follows the store.
  useEffect(() => {
    if (!editing) setDraft(text)
  }, [text, editing])

  async function commit() {
    if (saving.current) return
    const trimmed = draft.trim()
    // An emptied line is a deletion the user has not asked for, so it reverts instead.
    if (!trimmed || trimmed === baseline.current) {
      setDraft(text)
      setEditing(false)
      return
    }
    saving.current = true
    setPending(true)
    try {
      await onRename?.(trimmed, baseline.current)
      setEditing(false)
    } catch (error) {
      setSaveError(extractErrorMessage(error))
    } finally {
      saving.current = false
      setPending(false)
    }
  }

  function beginEditing() {
    baseline.current = text
    setSaveError(null)
    setEditing(true)
  }

  if (!onRename || disabled) {
    return (
      <Typography
        level="body-sm"
        sx={{ flex: 1, minWidth: 0, ...checklistItemTextSx(struck) }}
      >
        {text}
      </Typography>
    )
  }

  if (!editing) {
    return (
      <Box
        role="button"
        tabIndex={0}
        aria-label={tr("Edit {{v0}}", { v0: text })}
        onClick={beginEditing}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            beginEditing()
          }
        }}
        sx={{
          flex: 1,
          minWidth: 0,
          // Full-height so the whole line, not just the glyphs, opens the editor —
          // the row is a tap target on a phone even though it is text.
          alignSelf: 'stretch',
          display: 'flex',
          alignItems: 'center',
          px: 0.5,
          borderRadius: 'sm',
          cursor: 'text',
          '&:hover': { bgcolor: 'background.level1' }
        }}
      >
        <Typography
          level="body-sm"
          sx={checklistItemTextSx(struck)}
        >
          {text}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Input
        disabled={pending}
        autoFocus
        size="sm"
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setSaveError(null) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            setDraft(text)
            setEditing(false)
          }
        }}
        onBlur={() => { if (!saveError) void commit() }}
        slotProps={{
          input: { ref: input, 'aria-label': tr('Edit {{text}}', { text }), maxLength: MAX_TODO_ITEM_TEXT, enterKeyHint: 'done' }
        }}
        sx={{ flex: 1, minWidth: 0 }}
      />
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
