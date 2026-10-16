/** Period transitions retain an authorized dashboard, but account changes and failed requests cannot. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import type { AdminStats } from '@persistent/shared'
import { adminStatsQueryOptions } from './adminStatsQuery.js'

test('period changes preserve dashboard data while loading, then replace it without crossing accounts', async () => {
  const client = new QueryClient()
  const original = { userGrowth: { days: 90 } } as AdminStats
  const updated = { userGrowth: { days: 30 } } as AdminStats
  const initialOptions = adminStatsQueryOptions('first-admin', 30, 90)
  client.setQueryData(initialOptions.queryKey, original)
  const observer = new QueryObserver(client, { ...initialOptions, staleTime: Infinity })
  const unsubscribe = observer.subscribe(() => {})
  let finish!: (value: AdminStats) => void
  const pending = new Promise<AdminStats>((resolve) => { finish = resolve })
  try {
    observer.setOptions({ ...adminStatsQueryOptions('first-admin', 30, 30), queryFn: () => pending })
    assert.equal(observer.getCurrentResult().isPending, false)
    assert.equal(observer.getCurrentResult().isPlaceholderData, true)
    assert.equal(observer.getCurrentResult().data, original)

    finish(updated)
    await observer.refetch()
    assert.equal(observer.getCurrentResult().data, updated)
    assert.equal(observer.getCurrentResult().isPlaceholderData, false)

    observer.setOptions({ ...adminStatsQueryOptions('second-admin', 30, 30), queryFn: () => new Promise<AdminStats>(() => {}) })
    assert.equal(observer.getCurrentResult().data, undefined)
    assert.equal(observer.getCurrentResult().isPending, true)
  } finally {
    unsubscribe()
    client.clear()
  }
})

test('an authorization error removes prior period data', async () => {
  const client = new QueryClient()
  const options = adminStatsQueryOptions('admin', 30, 90)
  client.setQueryData(options.queryKey, { userGrowth: { days: 90 } } as AdminStats)
  const observer = new QueryObserver(client, { ...options, staleTime: Infinity })
  const unsubscribe = observer.subscribe(() => {})
  try {
    observer.setOptions({ ...adminStatsQueryOptions('admin', 30, 30), queryFn: async () => { throw new Error('Administrator access revoked') } })
    const result = await observer.refetch()
    assert.equal(result.isError, true)
    assert.equal(result.data, undefined)
  } finally {
    unsubscribe()
    client.clear()
  }
})
