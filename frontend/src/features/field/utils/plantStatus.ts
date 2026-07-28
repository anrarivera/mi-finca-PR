import type { PlantInstance } from '../types'
import type { FarmOperation } from '../hooks/useOperationsApi'
import { todayISO } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Plant visual status for map rendering:
//   planned → white  (planting date is in the future)
//   planted → green  (in the ground today)
//   removed → red    (harvested / killed / replaced — i.e. referenced by an
//                     operations-log entry, either individually via plantIds
//                     or through its whole row via a harvest's rowIds)
// ──────────────────────────────────────────────────────────────────────────

export type PlantVisualStatus = 'planned' | 'planted' | 'removed'

/** Sets of plant/row ids that operations have already covered. */
export type PlantMarks = {
  plantIds: Set<string>
  rowIds: Set<string>
}

// Collect the plants/rows that HARVESTS touched — only harvests turn a
// plant red. Every operation type can carry a rowIds/plantIds scope now
// ("fertilized rows 1–3"), and fertilizing a plant must not mark it as
// gone. Removed plants (died/replaced) don't need marking: they're deleted
// from the field and never render.
export function buildPlantMarks(operations: FarmOperation[]): PlantMarks {
  const plantIds = new Set<string>()
  const rowIds = new Set<string>()
  for (const op of operations) {
    if (op.type !== 'harvest') continue
    for (const id of op.plantIds ?? []) plantIds.add(id)
    for (const id of op.rowIds ?? []) rowIds.add(id)
  }
  return { plantIds, rowIds }
}

export function plantVisualStatus(
  plant: PlantInstance,
  marks: PlantMarks,
  rowId?: string
): PlantVisualStatus {
  if (marks.plantIds.has(plant.id)) return 'removed'
  if (rowId && marks.rowIds.has(rowId)) return 'removed'
  return plant.plantingDate <= todayISO() ? 'planted' : 'planned'
}

// Leaflet CircleMarker path options per status.
export const PLANT_STATUS_STYLE: Record<PlantVisualStatus, {
  fillColor: string
  color: string
}> = {
  planned: { fillColor: '#ffffff', color: '#2d4a1e' },
  planted: { fillColor: '#639922', color: '#2d4a1e' },
  removed: { fillColor: '#ef4444', color: '#7f1d1d' },
}
