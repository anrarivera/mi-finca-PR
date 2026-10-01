import { describe, it, expect, afterEach, vi } from 'vitest'
import { minDateFor } from './dateRange'

// Same evening trap as todayISO (features/field/types.test.ts): pin the
// farm's timezone before any Date exists — Node re-reads TZ when it is
// assigned, and each test file has its own worker.
vi.stubEnv('TZ', 'America/Puerto_Rico')

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

afterEach(() => { vi.useRealTimers() })

describe('minDateFor', () => {
  it('runs in the farm timezone (guards every assertion below)', () => {
    expect(new Date('2026-04-05T01:00:00Z').getTimezoneOffset()).toBe(240)
  })

  it('has no lower bound for "all"', () => {
    expect(minDateFor('all')).toBeNull()
  })

  it('counts back from the local date in the evening', () => {
    freezeAt('2026-04-05T01:00:00Z') // 2026-04-04, 9:00 PM in Puerto Rico
    expect(minDateFor('30')).toBe('2026-03-05')
    expect(minDateFor('90')).toBe('2026-01-04')
  })

  it('gives the same answer at noon of that local day', () => {
    freezeAt('2026-04-04T16:00:00Z')
    expect(minDateFor('30')).toBe('2026-03-05')
  })

  it('starts "year" at January 1st of the local year', () => {
    freezeAt('2027-01-01T01:00:00Z') // still New Year's Eve 2026 on the island
    expect(minDateFor('year')).toBe('2026-01-01')
  })
})
