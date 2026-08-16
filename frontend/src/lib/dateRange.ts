// Date-range presets shared by the Cuaderno de campo tab filters.
// (Plain module — react-refresh wants component files to export only
// components, so the helper lives here and the select lives in
// components/shared/logFilters.tsx.)

export type DateRange = 'all' | '30' | '90' | 'year'

/** Earliest ISO date (YYYY-MM-DD) the range admits; null = no bound. */
export function minDateFor(range: DateRange): string | null {
  if (range === 'all') return null
  const now = new Date()
  if (range === 'year') return `${now.getFullYear()}-01-01`
  const d = new Date(now)
  d.setDate(d.getDate() - Number(range))
  return d.toISOString().slice(0, 10)
}
