import { describe, it, expect, vi } from 'vitest'
import { farmToReselect, formatResetDate, shouldOfferSampleFarm } from './sampleFarm'
import type { Farm } from '@/store/useFarmStore'

// resetsAt is shown as a day in the device's time. Pinning the farm's
// timezone — Node re-reads TZ when it is assigned, and each test file has
// its own worker — makes the file behave the same on a laptop and on CI.
vi.stubEnv('TZ', 'America/Puerto_Rico')

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
    isSample: false,
    ...overrides,
  }
}

describe('formatResetDate', () => {
  it('runs in the farm timezone (guards every assertion below)', () => {
    expect(new Date('2026-10-04T02:30:00Z').getTimezoneOffset()).toBe(240)
  })

  it('names the local day, not the UTC one', () => {
    // 02:30 UTC on the 4th is 10:30 PM of the 3rd in Puerto Rico.
    expect(formatResetDate('2026-10-04T02:30:00Z', 'es-PR')).toBe('3 de octubre')
    expect(formatResetDate('2026-10-04T02:30:00Z', 'en-US')).toBe('October 3')
  })

  it('changes day at local midnight', () => {
    expect(formatResetDate('2026-10-04T03:59:59Z', 'es-PR')).toBe('3 de octubre')
    expect(formatResetDate('2026-10-04T04:00:00Z', 'es-PR')).toBe('4 de octubre')
  })

  it('has no date to show while there is none', () => {
    expect(formatResetDate(null, 'es-PR')).toBeNull()
    expect(formatResetDate(undefined, 'es-PR')).toBeNull()
    expect(formatResetDate('', 'es-PR')).toBeNull()
  })

  it('has no date to show for a timestamp it cannot read', () => {
    expect(formatResetDate('pronto', 'es-PR')).toBeNull()
  })
})

describe('farmToReselect', () => {
  const rivera = makeFarm('rivera')
  const altura = makeFarm('altura')
  const sample = makeFarm('sample', { isSample: true })

  it('keeps the farm that was active', () => {
    expect(farmToReselect([rivera, altura, sample], altura, 'rivera')).toBe(altura)
    expect(farmToReselect([rivera, altura, sample], sample, 'rivera')).toBe(sample)
  })

  it('goes by id — the refetched list holds new objects', () => {
    const before = { ...altura, name: 'Antes del refetch' }
    expect(farmToReselect([rivera, altura], before, 'rivera')).toBe(altura)
  })

  it('stays in the sample farm when it comes back under a new id', () => {
    const reseeded = makeFarm('sample-after-reset', { isSample: true })
    expect(farmToReselect([rivera, altura, reseeded], sample, 'rivera')).toBe(reseeded)
  })

  it('falls back to the favorite when the sample farm is gone for good', () => {
    expect(farmToReselect([rivera, altura], sample, 'altura')).toBe(altura)
  })

  it('never moves someone from a real farm into the sample farm', () => {
    const deleted = makeFarm('deleted')
    expect(farmToReselect([rivera, sample], deleted, 'rivera')).toBe(rivera)
  })

  it('takes the fallback on the first load', () => {
    expect(farmToReselect([rivera, altura, sample], null, 'altura')).toBe(altura)
  })

  it('selects nothing when not even the fallback is in the list', () => {
    expect(farmToReselect([], null, null)).toBeUndefined()
    expect(farmToReselect([rivera], null, 'altura')).toBeUndefined()
  })
})

describe('shouldOfferSampleFarm', () => {
  const newcomer = { isDemo: false, farmCount: 0, seen: false }

  it('asks a real account that has no farm yet', () => {
    expect(shouldOfferSampleFarm(newcomer)).toBe(true)
  })

  it('waits for the farm list — not loaded is not "no farms"', () => {
    expect(shouldOfferSampleFarm({ ...newcomer, farmCount: undefined })).toBe(false)
  })

  it('leaves alone whoever already has a farm, the sample one included', () => {
    expect(shouldOfferSampleFarm({ ...newcomer, farmCount: 1 })).toBe(false)
  })

  it('asks only once', () => {
    expect(shouldOfferSampleFarm({ ...newcomer, seen: true })).toBe(false)
  })

  it('never asks a demo account', () => {
    expect(shouldOfferSampleFarm({ ...newcomer, isDemo: true })).toBe(false)
  })
})
