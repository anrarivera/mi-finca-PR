// ──────────────────────────────────────────────────────────────────────────
// "Today" on the server is the FARM's calendar date, not the machine's.
// Production runs in UTC and the farms are in Puerto Rico (UTC−4, no DST):
// every evening from 8 PM to midnight the UTC calendar already reads
// tomorrow, so labores due today were reported overdue, reopened as 'due'
// and born 'due'. Every route and job takes its "today" from here.
//
// todayInAppTz() returns that calendar date at UTC MIDNIGHT — deliberately
// not the instant the day begins on the island (04:00Z). Date-only columns
// (@db.Date: recommendedDate, actualDate, foundDate…) carry no timezone:
// Prisma reads and writes them as UTC midnight of the calendar date, and
// new Date('2026-04-04') parses a request body the same way. UTC midnight
// of the LOCAL date is "today" in that same representation, so
// `recommendedDate < today` stays a pure calendar comparison.
// ──────────────────────────────────────────────────────────────────────────

// Any IANA zone; an invalid name throws here, at boot, not mid-request.
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Puerto_Rico'

const calendarDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})

/** The farm's calendar date, YYYY-MM-DD. */
export function todayIsoInAppTz(now: Date = new Date()): string {
  // Assembled from parts: the order of a formatted date is the locale's
  // business, the parts are not.
  const parts = calendarDate.formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** The farm's calendar date at UTC midnight — comparable with @db.Date columns. */
export function todayInAppTz(now: Date = new Date()): Date {
  return new Date(`${todayIsoInAppTz(now)}T00:00:00.000Z`)
}
