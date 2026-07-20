import { describe, it, expect } from 'vitest'
import { getMonthGrid } from './calendarGrid'

describe('getMonthGrid', () => {
  it('produces 6 weeks of 7 days', () => {
    const weeks = getMonthGrid(2026, 6) // July 2026
    expect(weeks).toHaveLength(6)
    for (const week of weeks) expect(week).toHaveLength(7)
  })

  it('places the first of the month on its weekday', () => {
    // July 1, 2026 is a Wednesday (index 3, weeks start Sunday)
    const weeks = getMonthGrid(2026, 6)
    const firstCell = weeks[0].findIndex(c => c.inMonth)
    expect(firstCell).toBe(3)
    expect(weeks[0][3].iso).toBe('2026-07-01')
  })

  it('marks leading/trailing days as out of month with correct dates', () => {
    const weeks = getMonthGrid(2026, 6)
    expect(weeks[0][2].inMonth).toBe(false)
    expect(weeks[0][2].iso).toBe('2026-06-30')
    const flat = weeks.flat()
    expect(flat.filter(c => c.inMonth)).toHaveLength(31) // July has 31 days
  })

  it('handles February in a leap year', () => {
    const weeks = getMonthGrid(2028, 1) // February 2028
    const flat = weeks.flat()
    expect(flat.filter(c => c.inMonth)).toHaveLength(29)
  })
})
