import type { PlacedField } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Harvest log — derived entirely from completed 'harvest' operations, which
// already capture date / quantity / unit in the check-off modal. No new
// storage: the operations calendar IS the log.
// ──────────────────────────────────────────────────────────────────────────

export type HarvestEntry = {
  operationId: string
  fieldId: string
  fieldName: string
  cropTypeId: string
  date: string          // completedDate (fallback: recommendedDate)
  quantity?: number
  unit?: string
  notes?: string
}

export type HarvestCropTotal = {
  cropTypeId: string
  harvests: number
  /** Sum of quantities per unit, e.g. { lbs: 120, cajas: 4 }. */
  totalsByUnit: Record<string, number>
}

export function collectHarvestEntries(fields: PlacedField[]): HarvestEntry[] {
  const entries: HarvestEntry[] = []
  for (const field of fields) {
    for (const event of field.plantingEvents ?? []) {
      for (const op of event.operations) {
        if (op.type !== 'harvest' || op.status !== 'completed') continue
        entries.push({
          operationId: op.id,
          fieldId: field.id,
          fieldName: field.name,
          cropTypeId: event.cropTypeId,
          date: op.completedDate ?? op.recommendedDate,
          quantity: op.quantity,
          unit: op.unit,
          notes: op.notes,
        })
      }
    }
  }
  // Newest first
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

export function totalHarvestsByCrop(entries: HarvestEntry[]): HarvestCropTotal[] {
  const byCrop = new Map<string, HarvestCropTotal>()
  for (const e of entries) {
    let t = byCrop.get(e.cropTypeId)
    if (!t) {
      t = { cropTypeId: e.cropTypeId, harvests: 0, totalsByUnit: {} }
      byCrop.set(e.cropTypeId, t)
    }
    t.harvests++
    if (e.quantity && e.quantity > 0) {
      const unit = e.unit?.trim() || 'lbs'
      t.totalsByUnit[unit] = (t.totalsByUnit[unit] ?? 0) + e.quantity
    }
  }
  return [...byCrop.values()].sort((a, b) => b.harvests - a.harvests)
}
