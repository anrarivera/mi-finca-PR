import { describe, it, expect, afterEach, vi } from 'vitest'
import { todayISO, toLocalISODate } from './types'

// The bug these tests pin down only shows west of UTC, in the evening: at
// 9 PM in Puerto Rico (UTC−4) the UTC calendar already reads tomorrow.
// Node re-reads TZ when it is assigned, so pinning it here — before any
// Date exists — makes the file behave the same on a developer laptop and
// on CI (UTC). Vitest runs each test file in its own worker: the pin
// stays in this file.
vi.stubEnv('TZ', 'America/Puerto_Rico')

// 2026-04-04, 9:00 PM in Puerto Rico.
const EVENING = new Date('2026-04-05T01:00:00Z')

afterEach(() => { vi.useRealTimers() })

describe('toLocalISODate', () => {
  it('runs in the farm timezone (guards every assertion below)', () => {
    expect(EVENING.getTimezoneOffset()).toBe(240)
    expect(EVENING.getHours()).toBe(21)
  })

  it('formats the local calendar date, not the UTC one', () => {
    expect(EVENING.toISOString().slice(0, 10)).toBe('2026-04-05')
    expect(toLocalISODate(EVENING)).toBe('2026-04-04')
  })

  it('changes day at local midnight', () => {
    expect(toLocalISODate(new Date('2026-04-04T03:59:59Z'))).toBe('2026-04-03')
    expect(toLocalISODate(new Date('2026-04-04T04:00:00Z'))).toBe('2026-04-04')
  })

  it('zero-pads month and day', () => {
    expect(toLocalISODate(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })
})

describe('todayISO', () => {
  it('is still today at 9 PM in Puerto Rico', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(EVENING)
    expect(todayISO()).toBe('2026-04-04')
  })

  it('accepts an injected clock', () => {
    expect(todayISO(EVENING)).toBe('2026-04-04')
  })
})
