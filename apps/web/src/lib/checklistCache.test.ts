/** Received checklist mutations must respond before the server and roll back on rejection. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reminder, SharedReminder } from '@persistent/shared'
import { mutationKeys, queryClient, queryKeys, registerMutationDefaults } from './queryClient.js'

registerMutationDefaults()
const reminder = {
  id: 'reminder', title: 'Synthetic checklist', details: null, type: 'TODO',
  typeData: { items: [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }] },
  checkedItemIds: [], hideCheckedItems: false
} as unknown as Reminder
const share = {
  ...reminder, permission: 'EDIT', isNote: true, editableReminder: reminder,
  activeFirings: [{ id: 'firing', checkedItemIds: [], status: 'FIRED' }]
} as unknown as SharedReminder

for (const [key, variables, verify] of [
  [mutationKeys.checkReminderItem, { id: 'reminder', arg: { itemId: 'a', checked: true } }, (value: SharedReminder) => {
    assert.deepEqual(value.checkedItemIds, ['a'])
    assert.deepEqual(value.editableReminder?.checkedItemIds, ['a'])
  }],
  [mutationKeys.checkOccurrenceItem, { id: 'firing', arg: { itemId: 'a', checked: true } }, (value: SharedReminder) => {
    assert.deepEqual(value.activeFirings[0]?.checkedItemIds, ['a'])
    assert.deepEqual(value.checkedItemIds, [])
  }],
  [mutationKeys.hideCheckedItems, { id: 'reminder', arg: { hidden: true } }, (value: SharedReminder) => {
    assert.equal(value.editableReminder?.hideCheckedItems, true)
  }],
  [mutationKeys.addTodoItem, { id: 'reminder', arg: { id: 'c', text: 'Third' } }, (value: SharedReminder) => {
    assert.equal((value.typeData as { items: unknown[] }).items.length, 3)
  }],
  [mutationKeys.renameTodoItem, { id: 'reminder', itemId: 'a', arg: { text: 'Renamed' } }, (value: SharedReminder) => {
    assert.equal((value.typeData as { items: { text: string }[] }).items[0]?.text, 'Renamed')
  }],
  [mutationKeys.removeTodoItem, { id: 'reminder', itemId: 'a' }, (value: SharedReminder) => {
    assert.equal((value.typeData as { items: unknown[] }).items.length, 1)
  }],
  [mutationKeys.reorderTodoItems, { id: 'reminder', arg: { itemIds: ['b', 'a'] } }, (value: SharedReminder) => {
    assert.equal((value.typeData as { items: { id: string }[] }).items[0]?.id, 'b')
  }]
] as const) {
  test(`received cache responds immediately and rolls back: ${key.join('/')}`, async () => {
    queryClient.clear()
    const other = { ...share, id: 'other', activeFirings: [{ ...share.activeFirings[0]!, id: 'other-firing' }] }
    queryClient.setQueryData(queryKeys.receivedShares, [share, other])
    const defaults = queryClient.getMutationDefaults(key)
    const context = await defaults.onMutate!(variables, {} as never)
    const updated = queryClient.getQueryData<SharedReminder[]>(queryKeys.receivedShares)!
    verify(updated[0]!)
    assert.deepEqual(updated[1], other)
    assert.equal(updated[1]?.editableReminder, reminder)
    assert.equal(updated[0]?.permission, 'EDIT')
    await defaults.onError!(new Error('Access revoked'), variables, context, {} as never)
    assert.deepEqual(queryClient.getQueryData(queryKeys.receivedShares), [share, other])
    queryClient.clear()
  })
}

test('failed checklist write cannot resurrect a revoked share or remove a new row', async () => {
  queryClient.clear()
  queryClient.setQueryData(queryKeys.receivedShares, [share])
  const defaults = queryClient.getMutationDefaults(mutationKeys.checkReminderItem)
  const variables = { id: share.id, arg: { itemId: 'a', checked: true } }
  const context = await defaults.onMutate!(variables, {} as never)
  const newRow = { ...share, id: 'new' }
  queryClient.setQueryData(queryKeys.receivedShares, [newRow])
  await defaults.onError!(new Error('Revoked'), variables, context, {} as never)
  assert.deepEqual(queryClient.getQueryData(queryKeys.receivedShares), [newRow])
  queryClient.removeQueries({ queryKey: queryKeys.receivedShares })
  await defaults.onError!(new Error('Revoked'), variables, context, {} as never)
  assert.equal(queryClient.getQueryData(queryKeys.receivedShares), undefined)
  queryClient.clear()
})

test('an older failed write preserves a newer checklist change', async () => {
  queryClient.clear()
  queryClient.setQueryData(queryKeys.receivedShares, [share])
  const defaults = queryClient.getMutationDefaults(mutationKeys.checkReminderItem)
  const first = { id: share.id, arg: { itemId: 'a', checked: true } }
  const context = await defaults.onMutate!(first, {} as never)
  await defaults.onMutate!({ id: share.id, arg: { itemId: 'b', checked: true } }, {} as never)
  await defaults.onError!(new Error('First failed'), first, context, {} as never)
  assert.deepEqual(queryClient.getQueryData<SharedReminder[]>(queryKeys.receivedShares)?.[0]?.checkedItemIds, ['a', 'b'])
  queryClient.clear()
})
