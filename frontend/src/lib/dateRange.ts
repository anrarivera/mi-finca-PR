// Date-range presets shared by the Cuaderno de campo tab filters.
// (Plain module — react-refresh wants component files to export only
// components, so the helper lives here and the select lives in
// components/shared/logFilters.tsx.)

import { toLocalISODate } from '@/features/field/types'

export type DateRange = 'all' | '30' | '90' | 'year'

/** Earliest ISO date (YYYY-MM-DD) the range admits; null = no bound. */
export function minDateFor(range: DateRange): string | null {
  if (range === 'all') return null
  const now = new Date()
  if (range === 'year') return `${now.getFullYear()}-01-01`
  const d = new Date(now)
  d.setDate(d.getDate() - Number(range))
  // Local end to end — setDate above counts in local time, so formatting
  // through UTC would land a day late every evening.
  return toLocalISODate(d)
}
