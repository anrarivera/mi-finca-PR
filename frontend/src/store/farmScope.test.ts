import { describe, it, expect } from 'vitest'
import { farmsInScope, recordsInScope } from './farmScope'
import type { Farm } from './useFarmStore'

function makeFarm(id: string, overrides: Partial<Farm> = {}): Farm {
  return {
    id,
    name: `Finca ${id}`,
    location: 'Gurabo, PR',
    farmType: 'mixed',
    isFavorite: false,
    totalAreaAcres: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    boundary: [],
    fieldIds: [],
    ...overrides,
  }
}

const ids = (farms: Farm[]) => farms.map(f => f.id)

// A real account with two farms of its own and the sample farm switched on.
const rivera = makeFarm('rivera', { isSample: false })
const altura = makeFarm('altura', { isSample: false })
const sample = makeFarm('sample', { name: 'Finca Demostración', isSample: true })
const account = [rivera, altura, sample]

describe('farmsInScope', () => {
  it('covers only the farmer\'s own farms while one of them is active', () => {
    expect(ids(farmsInScope(account, rivera))).toEqual(['rivera', 'altura'])
    expect(ids(farmsInScope(account, altura))).toEqual(['rivera', 'altura'])
  })

  it('shows the sample farm alone while it is the active farm', () => {
    expect(ids(farmsInScope(account, sample))).toEqual(['sample'])
  })

  it('keeps the sample farm out when no farm is active', () => {
    expect(ids(farmsInScope(account, null))).toEqual(['rivera', 'altura'])
    expect(farmsInScope([], null)).toEqual([])
  })

  it('takes a farm without the key for an ordinary farm', () => {
    const legacy = makeFarm('legacy')
    expect(legacy.isSample).toBeUndefined()
    expect(ids(farmsInScope([legacy, sample], legacy))).toEqual(['legacy'])
    expect(ids(farmsInScope([legacy, sample], null))).toEqual(['legacy'])
  })

  it('goes by the id of the active farm, not by the object', () => {
    // The store keeps activeFarm as its own copy (updateFarm spreads it).
    const activeCopy = { ...sample, fieldIds: ['f1'] }
    expect(farmsInScope(account, activeCopy)).toEqual([sample])
  })

  it('an account whose only farm is the sample farm sees it once it is active', () => {
    expect(ids(farmsInScope([sample], sample))).toEqual(['sample'])
    // Before any farm is active there is nothing of the farmer's to count.
    expect(farmsInScope([sample], null)).toEqual([])
  })

  describe('demo account (its seeded farm is a sample farm too)', () => {
    const seeded = makeFarm('seeded', { name: 'Finca Demostración', isSample: true })
    const created = makeFarm('created', { isSample: false })

    it('shows its data with only the seeded farm', () => {
      expect(ids(farmsInScope([seeded], seeded))).toEqual(['seeded'])
    })

    it('keeps the seeded farm and a farm it created apart', () => {
      expect(ids(farmsInScope([created, seeded], seeded))).toEqual(['seeded'])
      expect(ids(farmsInScope([created, seeded], created))).toEqual(['created'])
    })
  })
})

describe('recordsInScope', () => {
  // The field store only holds the farms whose fields were fetched — here
  // the farmer visited the sample farm and one of their own.
  const fields = [
    { id: 'f1', farmId: 'rivera' },
    { id: 'f2', farmId: 'sample' },
    { id: 'f3', farmId: 'sample' },
  ]

  it('drops the sample farm\'s records while a real farm is active', () => {
    const scoped = recordsInScope(fields, farmsInScope(account, rivera))
    expect(scoped.map(f => f.id)).toEqual(['f1'])
  })

  it('keeps only the sample farm\'s records while it is active', () => {
    const scoped = recordsInScope(fields, farmsInScope(account, sample))
    expect(scoped.map(f => f.id)).toEqual(['f2', 'f3'])
  })

  it('drops records of a farm that is no longer in the list', () => {
    // What a reset leaves behind until the stores are cleaned: the old
    // seed's records point at an id no farm has anymore.
    const orphan = [{ id: 'old', farmId: 'sample-before-reset' }]
    expect(recordsInScope(orphan, farmsInScope(account, sample))).toEqual([])
    expect(recordsInScope(orphan, farmsInScope(account, rivera))).toEqual([])
  })

  it('has nothing to show without farms in scope', () => {
    expect(recordsInScope(fields, [])).toEqual([])
  })
})
