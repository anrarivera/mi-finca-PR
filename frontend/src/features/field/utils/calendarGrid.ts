import type { PlacedField, RecommendedOperation } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Month-grid helpers for the operations calendar. Pure date math on local
// calendar dates (YYYY-MM-DD strings) — no Date-object timezone traps.
// ──────────────────────────────────────────────────────────────────────────

export type CalendarOp = {
  op: RecommendedOperation
  fieldName: string
  cropTypeId: string
  /** The date this op appears on: completedDate if done, else recommendedDate. */
  date: string
}

export type CalendarDay = {
  iso: string        // YYYY-MM-DD
  day: number        // 1-31
  inMonth: boolean   // false for leading/trailing cells of adjacent months
}

function iso(year: number, monthIndex: number, day: number): string {
  // Roll over via Date.UTC so day 0 / day 32 normalize correctly.
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

/**
 * 6 weeks × 7 days covering the given month, weeks starting on Sunday
 * (dom–sáb, the common PR convention).
 */
export function getMonthGrid(year: number, monthIndex: number): CalendarDay[][] {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const weeks: CalendarDay[][] = []
  let cursor = 1 - firstWeekday // day-of-month for the top-left cell

  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = []
    for (let d = 0; d < 7; d++, cursor++) {
      const cellIso = iso(year, monthIndex, cursor)
      week.push({
        iso: cellIso,
        day: Number(cellIso.slice(8, 10)),
        inMonth: cellIso.slice(0, 7) === iso(year, monthIndex, 1).slice(0, 7),
      })
    }
    weeks.push(week)
  }
  return weeks
}

/** All operations across fields, keyed by the date they appear on. */
export function collectOpsByDate(fields: PlacedField[]): Map<string, CalendarOp[]> {
  const byDate = new Map<string, CalendarOp[]>()
  for (const field of fields) {
    for (const event of field.plantingEvents ?? []) {
      for (const op of event.operations) {
        const date = op.status === 'completed'
          ? (op.completedDate ?? op.recommendedDate)
          : op.recommendedDate
        const list = byDate.get(date) ?? []
        list.push({ op, fieldName: field.name, cropTypeId: event.cropTypeId, date })
        byDate.set(date, list)
      }
    }
  }
  return byDate
}
