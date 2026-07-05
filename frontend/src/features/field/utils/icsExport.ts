import type { PlacedField, RecommendedOperation } from '../types'
import { getCropById } from '../data/cropLibrary'

// ──────────────────────────────────────────────────────────────────────────
// Calendar interop (issue #13). Two complementary paths, neither of which
// needs API credentials:
//   • buildOperationsICS  — an RFC 5545 .ics file with every pending
//     operation as an all-day event; imports into Google Calendar, Apple
//     Calendar, Outlook, etc.
//   • googleCalendarEventUrl — a prefilled "add event" link for one
//     operation, for farmers who prefer picking events one at a time.
// Full two-way Google sync would need an OAuth backend and stays out of
// scope here.
// ──────────────────────────────────────────────────────────────────────────

export type IcsOperation = {
  op: RecommendedOperation
  fieldName: string
  cropTypeId: string
}

/** RFC 5545 text escaping: backslash, semicolon, comma, newline. */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * RFC 5545 line folding: content lines must stay ≤75 octets; continuations
 * start with a single space. Folds on UTF-8 byte length, never splitting a
 * multi-byte character.
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line

  const out: string[] = []
  let current = ''
  let currentBytes = 0
  // First line gets 75 octets, continuations get 74 (space prefix takes one).
  let limit = 75
  for (const char of line) {
    const charBytes = encoder.encode(char).length
    if (currentBytes + charBytes > limit) {
      out.push(current)
      current = ' '
      currentBytes = 1
      limit = 75
    }
    current += char
    currentBytes += charBytes
  }
  if (current.trim().length > 0 || out.length === 0) out.push(current)
  return out.join('\r\n')
}

/** YYYY-MM-DD → YYYYMMDD (ICS "basic" date format). */
function toBasicDate(iso: string): string {
  return iso.replace(/-/g, '')
}

/** The day after the given YYYY-MM-DD, also in basic format (DTEND is exclusive). */
function nextDayBasic(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '')
}

/** Every operation still worth putting on a calendar (not completed/skipped). */
export function collectPendingOps(fields: PlacedField[]): IcsOperation[] {
  const items: IcsOperation[] = []
  for (const field of fields) {
    for (const event of field.plantingEvents ?? []) {
      for (const op of event.operations) {
        if (op.status === 'completed' || op.status === 'skipped') continue
        items.push({ op, fieldName: field.name, cropTypeId: event.cropTypeId })
      }
    }
  }
  return items.sort((a, b) => a.op.recommendedDate.localeCompare(b.op.recommendedDate))
}

function summaryFor(item: IcsOperation): string {
  const emoji = getCropById(item.cropTypeId)?.emoji
  return `${emoji ? emoji + ' ' : ''}${item.op.labelEs} — ${item.fieldName}`
}

function descriptionFor(item: IcsOperation): string {
  const crop = getCropById(item.cropTypeId)
  const parts = [
    crop ? `Cultivo: ${crop.nameEs}` : null,
    `Campo: ${item.fieldName}`,
    item.op.notes ?? null,
    item.op.product ? `Producto: ${item.op.product}` : null,
    'Generado por Mi Finca PR',
  ]
  return parts.filter(Boolean).join('\n')
}

/**
 * Build a complete VCALENDAR document for every pending operation across the
 * given fields. `dtStamp` is injectable for tests; it defaults to now.
 */
export function buildOperationsICS(
  fields: PlacedField[],
  dtStamp: string = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mi Finca PR//Calendario de labores//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Mi Finca PR — Labores',
  ]

  for (const item of collectPendingOps(fields)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.op.id}@mi-finca-pr`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;VALUE=DATE:${toBasicDate(item.op.recommendedDate)}`,
      `DTEND;VALUE=DATE:${nextDayBasic(item.op.recommendedDate)}`,
      `SUMMARY:${escapeIcsText(summaryFor(item))}`,
      `DESCRIPTION:${escapeIcsText(descriptionFor(item))}`,
      `CATEGORIES:${escapeIcsText(item.op.type)}`,
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

/**
 * Prefilled Google Calendar "add event" URL for a single operation —
 * an all-day event on its recommended date.
 */
export function googleCalendarEventUrl(item: IcsOperation): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summaryFor(item),
    dates: `${toBasicDate(item.op.recommendedDate)}/${nextDayBasic(item.op.recommendedDate)}`,
    details: descriptionFor(item),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
