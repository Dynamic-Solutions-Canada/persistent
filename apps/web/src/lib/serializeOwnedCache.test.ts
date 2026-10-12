import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import { deserializeAccountCache } from './accountCache.js'
import { serializeOwnedCache } from './serializeOwnedCache.js'

/** Exercise the serialized cache, since this is what survives an offline reload. */
function persistedClient(reminders: unknown, active: unknown, history: unknown): PersistedClient {
  return {
    timestamp: 1,
    buster: 'test',
    clientState: {
      mutations: [],
      queries: [
        { queryKey: ['reminders'], state: { data: reminders } },
        { queryKey: ['occurrences', 'active'], state: { data: active } },
        { queryKey: ['occurrences', 'upcoming'], state: { data: active } },
        { queryKey: ['occurrences', 'history'], state: { data: history } }
      ]
    }
  } as unknown as PersistedClient
}

test('offline cache keeps owned firings and removes received firings from every feed', () => {
  const active = [
    { id: 'owned-fire', reminderId: 'owned', reminder: { title: 'Private' } },
    { id: 'received-fire', reminderId: 'received', reminder: { title: 'Shared' } }
  ]
  const history = {
    pages: [{ occurrences: active, nextCursor: 'cursor' }],
    pageParams: ['']
  }
  const client = persistedClient([{ id: 'owned' }], active, history)

  const saved = JSON.parse(serializeOwnedCache(client)) as typeof client
  assert.deepEqual(
    (saved.clientState.queries[1]?.state.data as typeof active).map((row) => row.id),
    ['owned-fire']
  )
  assert.deepEqual(
    (saved.clientState.queries[2]?.state.data as typeof active).map((row) => row.id),
    ['owned-fire']
  )
  assert.deepEqual(
    ((saved.clientState.queries[3]?.state.data as typeof history).pages[0]?.occurrences ?? []).map((row) => row.id),
    ['owned-fire']
  )
  assert.deepEqual((saved.clientState.queries[3]?.state.data as typeof history).pageParams, [''])
  assert.equal((saved.clientState.queries[3]?.state.data as typeof history).pages[0]?.nextCursor, 'cursor')
  assert.doesNotMatch(JSON.stringify(saved), /Shared|received-fire/)
  assert.equal(active.length, 2, 'the live query cache remains intact')
})

test('occurrences are not saved when the owned reminder list is unavailable', () => {
  const client = persistedClient(undefined, [{ reminderId: 'received', id: 'fire' }], {
    pages: [{ occurrences: [{ reminderId: 'received', id: 'fire' }], nextCursor: null }],
    pageParams: ['']
  })

  const saved = JSON.parse(serializeOwnedCache(client)) as typeof client
  assert.deepEqual(saved.clientState.queries[1]?.state.data, [])
  assert.deepEqual(saved.clientState.queries[2]?.state.data, [])
  assert.deepEqual((saved.clientState.queries[3]?.state.data as { pages: Array<{ occurrences: unknown[] }> }).pages[0]?.occurrences, [])
})

test('administrator aggregates cannot survive offline serialization', () => {
  const client = persistedClient([{ id: 'owned' }], [], { pages: [], pageParams: [] })
  client.clientState.queries.push({ queryKey: ['admin', 'owner', 'stats', 30], state: { data: { secretAggregate: 42 } } } as never)
  const saved = serializeOwnedCache(client)
  assert.doesNotMatch(saved, /secretAggregate|"admin"/)
  assert.equal(client.clientState.queries.length, 5, 'live data is not mutated while serializing')
})

test('paused mutations retain only owned writes and remove received rollback content', () => {
  const client = persistedClient([{ id: 'owned' }], [
    { id: 'own-fire', reminderId: 'owned' }, { id: 'shared-fire', reminderId: 'shared' }
  ], { pages: [], pageParams: [] })
  client.clientState.mutations = [
    { mutationKey: ['reminders', 'check'], state: { variables: { id: 'owned' }, context: {
      received: [{ title: 'PRIVATE SHARED CONTENT' }],
      checklist: { owned: [{ id: 'owned' }], received: [{ title: 'PRIVATE SHARED CONTENT' }] }
    } } },
    { mutationKey: ['reminders', 'check'], state: { variables: { id: 'shared', arg: { text: 'PRIVATE SHARED CONTENT' } } } },
    { mutationKey: ['occurrences', 'check'], state: { variables: { id: 'shared-fire' } } },
    { mutationKey: ['occurrences', 'ack'], state: { variables: { id: 'own-fire' }, context: {
      previous: [{ id: 'own-fire', reminderId: 'owned' }, { id: 'shared-fire', reminderId: 'shared', title: 'PRIVATE SHARED CONTENT' }]
    } } }
  ] as never
  const saved = JSON.parse(serializeOwnedCache(client)) as PersistedClient
  assert.equal(saved.clientState.mutations.length, 2)
  assert.doesNotMatch(JSON.stringify(saved), /PRIVATE SHARED CONTENT|shared-fire/)
  assert.match(JSON.stringify(client), /PRIVATE SHARED CONTENT/, 'live state remains intact')
})

test('owned completion and deletion queues survive their optimistic list removal', () => {
  const client = persistedClient([{ id: 'owned' }], [], { pages: [], pageParams: [] })
  client.clientState.mutations = [
    { mutationKey: ['occurrences', 'ack'], state: { variables: { id: 'own-fire' }, context: {
      previous: [{ id: 'own-fire', reminderId: 'owned' }, { id: 'shared-fire', reminderId: 'shared' }]
    } } },
    { mutationKey: ['reminders', 'delete'], state: { variables: 'deleted-owned', context: { previous: [{ id: 'deleted-owned' }] } } }
  ] as never
  const saved = JSON.parse(serializeOwnedCache(client)) as PersistedClient
  assert.equal(saved.clientState.mutations.length, 2)
  assert.doesNotMatch(JSON.stringify(saved), /shared-fire/)
})


test('restoring an older account-bound cache strips shared queries and queued writes', () => {
  const client = persistedClient([{ id: 'owned' }], [], { pages: [], pageParams: [] })
  client.clientState.queries.push({ queryKey: ['shares', 'received'], state: { data: [{ title: 'PRIVATE SHARED CONTENT' }] } } as never)
  client.clientState.mutations = [
    { mutationKey: ['reminders', 'check'], state: { variables: { id: 'shared' }, context: { received: [{ title: 'PRIVATE SHARED CONTENT' }] } } },
    { mutationKey: ['reminders', 'check'], state: { variables: { id: 'owned' }, context: { received: [{ title: 'PRIVATE SHARED CONTENT' }] } } }
  ] as never
  const restored = deserializeAccountCache(JSON.stringify({ ...client, accountId: 'account' }), 'account')
  assert.equal(restored.clientState.mutations.length, 1)
  assert.doesNotMatch(JSON.stringify(restored), /PRIVATE SHARED CONTENT|"shares"|"shared"/)
})
