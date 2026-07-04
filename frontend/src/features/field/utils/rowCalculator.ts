import type { FieldRow, PlantInstance } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Claude: removed the legacy `calculateRowPlants` function, its `RowInput`
// type, and the `CANVAS_W`/`CANVAS_H` constants (TS2353 cleanup). It was dead
// code — never imported anywhere — and no longer compiled: it produced
// PlantInstance objects with `x`/`y` pixel fields, but PlantInstance now uses
// geographic `lat`/`lng` (see ../types). Row planting is handled via
// geographic coordinates elsewhere (utils/canvasGeo + plantingEventManager).
// ──────────────────────────────────────────────────────────────────────────

export function computeCropSummary(
  rows: FieldRow[],
  freePlants: PlantInstance[],
  getCrop: (id: string) => { name: string; nameEs: string; emoji: string } | undefined
) {
  const counts: Record<string, number> = {}

  rows.forEach(row =>
    row.plants.forEach(p => {
      counts[p.cropTypeId] = (counts[p.cropTypeId] || 0) + 1
    })
  )
  freePlants.forEach(p => {
    counts[p.cropTypeId] = (counts[p.cropTypeId] || 0) + 1
  })

  return Object.entries(counts).map(([cropTypeId, count]) => {
    const crop = getCrop(cropTypeId)
    return {
      cropTypeId,
      name: crop?.name ?? cropTypeId,
      nameEs: crop?.nameEs ?? cropTypeId,
      emoji: crop?.emoji ?? '🌱',
      count,
    }
  })
}