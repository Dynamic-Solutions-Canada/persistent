/**
 * The add row under a checklist in the reading dialog: extend a list without
 * opening the editor.
 *
 * The quiet add button stays visible when a draft row opens above it, so the new
 * item occupies the list rather than replacing the control that created it.
 *
 * Once open it *stays* open after each item, focus intact — a list is usually
 * extended by more than one line, and having to re-open the field between lines is
 * exactly the friction that sends people to the editor instead. An empty field
 * closes itself, so there is nothing to tidy up.
 *
 * What it adds is an item, and items belong to the reminder: the new line joins the
 * definition, so every later firing carries it, and it arrives unticked — which
 * means it also joins the body of whatever is nagging right now
 * (docs/notification-behavior.md §1a). It never touches a tick.
 */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { useEffect, useRef, useState } from 'react'
import Input from '@mui/joy/Input'
import Button from '@mui/joy/Button'
import IconButton from '@mui/joy/IconButton'
import Stack from '@mui/joy/Stack'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import { MAX_TODO_ITEM_TEXT, type TodoItem } from '@persistent/shared'
import { newTodoItemId } from '../lib/todoItemId.js'

export function TodoAddItem({
  onAdd,
  disabled
}: {
  /** Called with a fully-formed item — the id is minted here, once, per item. */
  onAdd: (item: TodoItem) => void
  disabled?: boolean
}) {
  useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement | null>(null)
  const draft = useRef('')
  const add = useRef(onAdd)
  useEffect(() => { add.current = onAdd }, [onAdd])
  // Back and backdrop dismissal can unmount without blurring the input.
  useEffect(() => () => {
    const trimmed = draft.current.trim()
    draft.current = ''
    if (trimmed) add.current({ id: newTodoItemId(), text: trimmed })
  }, [])

  function commit(focus = true) {
    const trimmed = draft.current.trim()
    draft.current = ''
    // An empty submit is the user saying they're done, not an item.
    if (!trimmed) {
      setOpen(false)
      return
    }
    onAdd({ id: newTodoItemId(), text: trimmed })
    setText('')
    // Tapping the save icon moves focus onto it, so put it back for the next line.
    if (focus) input.current?.focus()
  }

  return (
    <Stack spacing={0.5} sx={{ width: '100%' }}>
      {open && (
        <Input
          autoFocus
          size="sm"
          value={text}
          disabled={disabled}
          placeholder={tr("New item")}
          onChange={(event) => { draft.current = event.target.value; setText(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              draft.current = ''
              setText('')
              setOpen(false)
            }
          }}
          onBlur={() => {
            // Commit before the ensuing click (Close, Done, Edit, etc.).
            // Clear the ref synchronously so a following plus click cannot duplicate it.
            commit(false)
          }}
          slotProps={{
            input: {
              ref: input,
              'aria-label': tr('New checklist item'),
              maxLength: MAX_TODO_ITEM_TEXT,
              enterKeyHint: 'done'
            }
          }}
          endDecorator={
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              aria-label={text.trim() ? tr("Save new item") : tr("Cancel new item")}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (text.trim()) commit()
                else setOpen(false)
              }}
            >
              {text.trim() ? <AddIcon /> : <CloseIcon />}
            </IconButton>
          }
          sx={{ flex: 1, minWidth: 0 }}
        />
      )}
      <Button
        variant="plain"
        color="neutral"
        size="sm"
        disabled={disabled}
        startDecorator={<AddIcon />}
        onClick={() => {
          if (open && text.trim()) commit()
          else {
            setOpen(true)
            input.current?.focus()
          }
        }}
        // A real tap target, like "Hide checked" beside it: this is used one-handed
        // and sometimes against a ringing alarm.
        sx={{ minHeight: 32, px: 1, fontSize: 'xs', fontWeight: 'md', alignSelf: 'flex-start' }}
      >{tr("Add item")}</Button>
    </Stack>
  )
}
