import type { PlacedField, RecommendedOperation } from '../field/types'
import { todayISO } from '../field/types'
import { getScheduleForCrop } from '../field/data/cropSchedules'
import type { CropSchedule } from '../field/data/cropSchedules'

// ──────────────────────────────────────────────────────────────────────────
// Inventory grid (issue #15). One row per planting event — the unit the
// operations engine already tracks — with everything a farmer needs to scan
// their whole finca: what is planted where, how it is doing, what needs to
// happen next, and when the harvest window opens.
// ──────────────────────────────────────────────────────────────────────────

export type InventoryStatus = 'overdue' | 'dueSoon' | 'ok' | 'done'

export type InventoryOp = {
  id: string
  labelEs: string
  type: string
  date: string
  status: RecommendedOperation['status']
  daysFromToday: number
}

export type InventoryRow = {
  /** Planting event id — stable and unique. */
  id: string
  farmId: string
  farmName: string
  fieldId: string
  fieldName: string
  cropTypeId: string
  /** Planted in rows, as individual plants, or both. */
  source: 'rows' | 'plants' | 'mixed'
  rowCount: number
  plantCount: number
  plantingDate: string
  ageDays: number
  status: InventoryStatus
  nextOp: InventoryOp | null
  pendingOpsCount: number
  overdueOpsCount: number
  completedOpsCount: number
  /** Projected harvest window from the crop schedule, if one exists. */
  harvestWindow: { start: string; end: string } | null
  /** Every operation of the event, sorted by date — for the expanded view. */
  operations: InventoryOp[]
}

const DUE_SOON_DAYS = 14

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Flatten every planting event across all fields into inventory rows.
 * `farms` only needs id+name (for display); fields not belonging to any
 * known farm still appear, with an em-dash farm name, so nothing silently
 * drops out of the inventory.
 */
export function buildInventoryRows(
  farms: Array<{ id: string; name: string }>,
  fields: PlacedField[],
  todayIso: string = todayISO(),
  getSchedule: (cropTypeId: string) => CropSchedule | undefined = getScheduleForCrop,
): InventoryRow[] {
  const farmNames = new Map(farms.map(f => [f.id, f.name]))
  const rows: InventoryRow[] = []

  for (const field of fields) {
    for (const event of field.plantingEvents ?? []) {
      const ops: InventoryOp[] = event.operations
        .map(op => ({
          id: op.id,
          labelEs: op.labelEs,
          type: op.type,
          date: op.status === 'completed'
            ? (op.completedDate ?? op.recommendedDate)
            : op.recommendedDate,
          status: op.status,
          daysFromToday: daysBetween(todayIso, op.recommendedDate),
        }))
        .sort((a, b) => a.date.localeCompare(b.date))

      const pending = ops.filter(o => o.status !== 'completed' && o.status !== 'skipped')
      const overdueOps = pending.filter(o => o.daysFromToday < 0)
      const dueSoonOps = pending.filter(o => o.daysFromToday >= 0 && o.daysFromToday <= DUE_SOON_DAYS)

      const status: InventoryStatus =
        overdueOps.length > 0 ? 'overdue'
        : dueSoonOps.length > 0 ? 'dueSoon'
        : pending.length > 0 ? 'ok'
        : 'done'

      const nextOp = pending
        .slice()
        .sort((a, b) => a.daysFromToday - b.daysFromToday)[0] ?? null

      const schedule = getSchedule(event.cropTypeId)
      const harvestWindow = schedule
        ? {
            start: addDays(event.plantingDate, schedule.harvestWindowStartDays),
            end: addDays(event.plantingDate, schedule.harvestWindowEndDays),
          }
        : null

      const rowCount = event.rowIds.length
      const freeCount = event.freePlantIds.length
      const source: InventoryRow['source'] =
        rowCount > 0 && freeCount > 0 ? 'mixed' : rowCount > 0 ? 'rows' : 'plants'

      rows.push({
        id: event.id,
        farmId: field.farmId,
        farmName: farmNames.get(field.farmId) ?? '—',
        fieldId: field.id,
        fieldName: field.name,
        cropTypeId: event.cropTypeId,
        source,
        rowCount,
        plantCount: event.plantCount,
        plantingDate: event.plantingDate,
        ageDays: daysBetween(event.plantingDate, todayIso),
        status,
        nextOp,
        pendingOpsCount: pending.length,
        overdueOpsCount: overdueOps.length,
        completedOpsCount: ops.length - pending.length,
        harvestWindow,
        operations: ops,
      })
    }
  }

  return rows
}

/** Roll-up numbers for the tiles above the grid. */
export function summarizeInventory(rows: InventoryRow[]) {
  return {
    plantings: rows.length,
    plants: rows.reduce((sum, r) => sum + r.plantCount, 0),
    overdue: rows.reduce((sum, r) => sum + r.overdueOpsCount, 0),
    pending: rows.reduce((sum, r) => sum + r.pendingOpsCount, 0),
    crops: new Set(rows.map(r => r.cropTypeId)).size,
  }
}
