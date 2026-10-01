import type { FieldRow, PlacedField, PlantInstance, PlantingEvent } from '@/features/field/types'
import type { HarvestTargets } from '@/features/field/components/operationsView'
import type { Finding } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Scope helpers for findings. A finding's scope is the same {rowIds,
// plantIds} shape operations use, but against the WHOLE field — scouting is
// not tied to one planting event the way a calendar operation is.
// ──────────────────────────────────────────────────────────────────────────

// Everything in the field the scope selector can pick from: all rows (with
// their position, so labels read "Hilera 3") and all free-standing plants.
export function fieldScopeTargets(field: {
  rows: FieldRow[]
  freePlants: PlantInstance[]
}): HarvestTargets {
  return {
    rows: field.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.plants.length > 0),
    freePlants: field.freePlants,
  }
}

// Human summary of a scope: "Todo el campo", "Hileras 1, 3",
// "Hilera 2 + 4 plantas", "5 plantas". Accepts findings and observations
// alike — anything carrying the {rowIds, plantIds} shape.
export function findingScopeSummary(
  finding: Pick<Finding, 'rowIds' | 'plantIds'>,
  rows: FieldRow[]
): string {
  if (finding.rowIds.length === 0 && finding.plantIds.length === 0) {
    return 'Todo el campo'
  }
  const parts: string[] = []
  if (finding.rowIds.length > 0) {
    const numbers = finding.rowIds
      .map(id => rows.findIndex(r => r.id === id) + 1)
      .filter(n => n > 0)
      .sort((a, b) => a - b)
    parts.push(numbers.length === 1
      ? `Hilera ${numbers[0]}`
      : `Hileras ${numbers.join(', ')}`)
  }
  if (finding.plantIds.length > 0) {
    parts.push(`${finding.plantIds.length} ${finding.plantIds.length === 1 ? 'planta' : 'plantas'}`)
  }
  return parts.join(' + ')
}

// The rows a treatment should cover: the finding's own rows plus every row
// containing one of its individually marked plants (findings are precise,
// treatments are coarse — a sprayer works row by row).
export function rowsCoveringFinding(finding: Finding, rows: FieldRow[]): FieldRow[] {
  const plantSet = new Set(finding.plantIds)
  return rows.filter(r =>
    finding.rowIds.includes(r.id) || r.plants.some(p => plantSet.has(p.id))
  )
}

// Rows belonging to a planting event — explicit membership when present,
// else the grouping invariant (same crop + same planting date), mirroring
// harvestTargetsForOperation's fallback for legacy fields.
function eventRowIds(event: PlantingEvent, rows: FieldRow[]): Set<string> {
  if (event.rowIds.length > 0) return new Set(event.rowIds)
  return new Set(
    rows
      .filter(r =>
        (r.primaryCropTypeId === event.cropTypeId ||
         r.companionCropTypeId === event.cropTypeId) &&
        r.plantingDate === event.plantingDate
      )
      .map(r => r.id)
  )
}

// Which planting event a treatment labor should hang from: the event whose
// rows/plants overlap the finding's scope the most; for field-level
// findings, the event whose crop the pest targets, else the newest event.
// Null only when the field has no planting events at all (no calendar to
// add the labor to).
export function eventForFinding(
  finding: Finding,
  field: Pick<PlacedField, 'rows' | 'freePlants' | 'plantingEvents'>,
  pestCrops: string[]
): PlantingEvent | null {
  const events = field.plantingEvents ?? []
  if (events.length === 0) return null

  const affectedRows = rowsCoveringFinding(finding, field.rows)
  const affectedRowIds = new Set(affectedRows.map(r => r.id))
  const plantSet = new Set(finding.plantIds)

  let best: PlantingEvent | null = null
  let bestScore = 0
  for (const event of events) {
    const rowIds = eventRowIds(event, field.rows)
    let score = 0
    for (const id of affectedRowIds) if (rowIds.has(id)) score += 10
    const freeIds = event.freePlantIds.length > 0
      ? new Set(event.freePlantIds)
      : new Set(
          field.freePlants
            .filter(p => p.cropTypeId === event.cropTypeId && p.plantingDate === event.plantingDate)
            .map(p => p.id)
        )
    for (const id of plantSet) if (freeIds.has(id)) score += 1
    if (score > bestScore) { best = event; bestScore = score }
  }
  if (best) return best

  // Field-level finding (or no overlap): prefer the crop the pest targets.
  const cropSet = new Set(pestCrops)
  const byCrop = events.find(e => cropSet.has(e.cropTypeId))
  if (byCrop) return byCrop

  // Newest planting as a last resort.
  return [...events].sort(
    (a, b) => b.plantingDate.localeCompare(a.plantingDate)
  )[0]
}

// Whether "Crear labor" is available: one OPEN treatment at a time, but a
// finding that worsened after its labor was completed (or skipped) can get
// a new one. A linked labor missing from the calendar counts as gone (the
// server re-validates either way).
export function canCreateTreatmentLabor(
  finding: Finding,
  plantingEvents: PlantingEvent[]
): boolean {
  if (!finding.treatmentRecommendedOperationId) return true
  const op = plantingEvents
    .flatMap(e => e.operations)
    .find(o => o.id === finding.treatmentRecommendedOperationId)
  return !op || op.status === 'completed' || op.status === 'skipped'
}

// ── Map paint ─────────────────────────────────────────────────────────
// Highest unresolved severity per row/plant id — feeds the amber→red paint
// on the farm map (extends the plantMarks pattern). Resolved findings stop
// painting; open and treated ones keep showing until the farmer closes them.
export type FindingMarks = {
  rowSeverity: Map<string, number>
  plantSeverity: Map<string, number>
}

export const EMPTY_FINDING_MARKS: FindingMarks = {
  rowSeverity: new Map(),
  plantSeverity: new Map(),
}

export function buildFindingMarks(findings: Finding[]): FindingMarks {
  const rowSeverity = new Map<string, number>()
  const plantSeverity = new Map<string, number>()
  for (const f of findings) {
    if (f.status === 'resolved') continue
    for (const id of f.rowIds) {
      rowSeverity.set(id, Math.max(rowSeverity.get(id) ?? 0, f.severity))
    }
    for (const id of f.plantIds) {
      plantSeverity.set(id, Math.max(plantSeverity.get(id) ?? 0, f.severity))
    }
  }
  return { rowSeverity, plantSeverity }
}
