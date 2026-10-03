import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { invalidateLogViews } from './logCache'

// The keys as the hooks build them (useOperations, useOperationsLedger,
// the harvest ledger in harvestLogSection, useFields).
const FARM_LOG = ['operations', 'farm-1']
const CUADERNO_LEDGER = ['operations', 'ledger', 'farm-1,farm-2']
const PRODUCTION_LEDGER = ['harvests', 'farm-1,farm-2']
const FIELDS = ['fields', 'farm-1']

function seededClient(): QueryClient {
  const queryClient = new QueryClient()
  for (const key of [FARM_LOG, CUADERNO_LEDGER, PRODUCTION_LEDGER, FIELDS]) {
    queryClient.setQueryData(key, [])
  }
  return queryClient
}

const isInvalidated = (queryClient: QueryClient, key: string[]) =>
  queryClient.getQueryState(key)?.isInvalidated

describe('invalidateLogViews', () => {
  it('marks the production ledger stale along with the operations log', () => {
    const queryClient = seededClient()
    expect(isInvalidated(queryClient, PRODUCTION_LEDGER)).toBe(false)

    invalidateLogViews(queryClient)

    expect(isInvalidated(queryClient, PRODUCTION_LEDGER)).toBe(true)
    expect(isInvalidated(queryClient, FARM_LOG)).toBe(true)
  })

  it('reaches the multi-farm ledger, which a per-farm key does not', () => {
    const queryClient = seededClient()

    queryClient.invalidateQueries({ queryKey: ['operations', 'farm-1'] })
    expect(isInvalidated(queryClient, CUADERNO_LEDGER)).toBe(false)

    invalidateLogViews(queryClient)
    expect(isInvalidated(queryClient, CUADERNO_LEDGER)).toBe(true)
  })

  it('leaves unrelated queries alone', () => {
    const queryClient = seededClient()

    invalidateLogViews(queryClient)

    expect(isInvalidated(queryClient, FIELDS)).toBe(false)
  })
})
