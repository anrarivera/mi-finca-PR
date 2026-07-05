import type { PlacedField } from '../field/types'
import { todayISO } from '../field/types'

// ──────────────────────────────────────────────────────────────────────────
// In-app notifications (issue #14). Notifications are DERIVED, never stored:
// every render recomputes them from the fields' operations, so they can
// never drift out of sync with the calendar. Only the "seen" ids persist
// (in useSettingsStore).
// ──────────────────────────────────────────────────────────────────────────

export type NotificationKind = 'overdue' | 'dueSoon' | 'harvest'

export type FarmNotification = {
  /** Stable id — the underlying operation's id. */
  id: string
  kind: NotificationKind
  labelEs: string
  fieldName: string
  cropTypeId: string
  /** The operation's recommended date (YYYY-MM-DD). */
  date: string
  /** Negative = days overdue, 0 = today, positive = days from now. */
  daysFromToday: number
}

export type NotificationPrefs = {
  /** Master switch for the in-app bell. */
  enabled: boolean
  notifyOverdue: boolean
  notifyDueSoon: boolean
  /** Harvest-window operations get their own toggle and icon. */
  notifyHarvest: boolean
  /** How many days ahead an operation counts as "próxima". */
  dueSoonLeadDays: number
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  notifyOverdue: true,
  notifyDueSoon: true,
  notifyHarvest: true,
  dueSoonLeadDays: 14,
}

/** Whole-day difference between two YYYY-MM-DD strings (to - from). */
function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * Collect every operation that deserves the farmer's attention right now.
 * Harvest-type operations are governed solely by `notifyHarvest`; all other
 * types split between `notifyOverdue` (past due) and `notifyDueSoon`
 * (within `dueSoonLeadDays`). Most-overdue first.
 */
export function buildNotifications(
  fields: PlacedField[],
  prefs: NotificationPrefs,
  todayIso: string = todayISO(),
): FarmNotification[] {
  if (!prefs.enabled) return []

  const items: FarmNotification[] = []
  for (const field of fields) {
    for (const event of field.plantingEvents ?? []) {
      for (const op of event.operations) {
        if (op.status === 'completed' || op.status === 'skipped') continue

        const daysFromToday = daysBetween(todayIso, op.recommendedDate)
        if (daysFromToday > prefs.dueSoonLeadDays) continue

        let kind: NotificationKind
        if (op.type === 'harvest') {
          if (!prefs.notifyHarvest) continue
          kind = 'harvest'
        } else if (daysFromToday < 0) {
          if (!prefs.notifyOverdue) continue
          kind = 'overdue'
        } else {
          if (!prefs.notifyDueSoon) continue
          kind = 'dueSoon'
        }

        items.push({
          id: op.id,
          kind,
          labelEs: op.labelEs,
          fieldName: field.name,
          cropTypeId: event.cropTypeId,
          date: op.recommendedDate,
          daysFromToday,
        })
      }
    }
  }

  return items.sort(
    (a, b) => a.daysFromToday - b.daysFromToday || a.fieldName.localeCompare(b.fieldName)
  )
}

/** "hace 3 días" / "hoy" / "mañana" / "en 5 días" — for the bell dropdown. */
export function formatRelativeDaysEs(daysFromToday: number): string {
  if (daysFromToday === 0) return 'hoy'
  if (daysFromToday === 1) return 'mañana'
  if (daysFromToday === -1) return 'ayer'
  if (daysFromToday < 0) return `hace ${-daysFromToday} días`
  return `en ${daysFromToday} días`
}
