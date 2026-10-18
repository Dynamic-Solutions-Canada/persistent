/** Checklist writes shared by owner and recipient reading views. */
import { todoItems, type Reminder } from '@persistent/shared'
import { useCheckOccurrenceItem } from '../data/occurrences.js'
import {
  useAddTodoItem, useCheckReminderItem, useRemoveTodoItem,
  useRenameTodoItem, useReorderTodoItems, useSetHideCheckedItems
} from '../data/reminders.js'
import { TodoChecklist } from './TodoChecklist.js'

/** A note owns ticks; otherwise only a live firing can receive progress writes. */
export function ReminderChecklist({ reminder, firing, isNote, editable = true, actionable = true }: {
  reminder: Pick<Reminder, 'id' | 'typeData' | 'checkedItemIds' | 'hideCheckedItems'>
  firing?: { id: string; checkedItemIds: string[] }
  isNote: boolean
  editable?: boolean
  actionable?: boolean
}) {
  const check = useCheckOccurrenceItem()
  const checkNote = useCheckReminderItem()
  const add = useAddTodoItem()
  const rename = useRenameTodoItem()
  const remove = useRemoveTodoItem()
  const reorder = useReorderTodoItems()
  const hide = useSetHideCheckedItems()
  const hasProgress = Boolean(firing || isNote)

  return <TodoChecklist
    items={todoItems(reminder.typeData)}
    checkedItemIds={firing?.checkedItemIds ?? (isNote ? reminder.checkedItemIds : [])}
    confirmable={Boolean(firing)}
    onToggle={actionable && hasProgress ? (itemId, checked) => {
      const arg = { itemId, checked }
      if (firing) check.mutate({ id: firing.id, arg })
      else checkNote.mutate({ id: reminder.id, arg })
    } : undefined}
    onAddItem={editable ? (item) => add.mutate({ id: reminder.id, arg: item }) : undefined}
    onRenameItem={editable ? (itemId, text, expectedText) => rename.mutateAsync({ id: reminder.id, itemId, arg: { text, expectedText } }) : undefined}
    onRemoveItem={editable ? (itemId) => remove.mutate({ id: reminder.id, itemId }) : undefined}
    onReorder={editable ? (itemIds) => reorder.mutate({ id: reminder.id, arg: { itemIds } }) : undefined}
    hideChecked={hasProgress && reminder.hideCheckedItems}
    onHideCheckedChange={editable && hasProgress ? (hidden) => hide.mutate({ id: reminder.id, arg: { hidden } }) : undefined}
  />
}
