import { useFieldStore } from '@/store/useFieldStore'
import type { PlacedField, PlantingEvent } from '../types'
import type { ScheduleDraft } from '../components/recipeScheduleForm'

// ──────────────────────────────────────────────────────────────────────────
// "Guardar como receta" — lift a real planting's calendar into a recipe
// draft (Recetas de Cultivo phase 4). Season one is manual; season two
// gets a recipe derived from what actually happened:
//  - completed ops use their REAL offset (completedDate − plantingDate)
//  - still-pending ops keep their planned offset (they're part of the plan)
//  - skipped ops are excluded — the farmer decided against them
// The calendar rows are one-per-template, so multi-day harvest logs never
// duplicate. Template ids are omitted; the server mints fresh ones.
// ──────────────────────────────────────────────────────────────────────────

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export type LiftedSchedule = {
  draft: ScheduleDraft
  liftedCount: number
  skippedCount: number
}

export function liftScheduleFromPlanting(event: PlantingEvent): LiftedSchedule | null {
  const usable = event.operations.filter(op => op.status !== 'skipped')
  const skippedCount = event.operations.length - usable.length
  if (usable.length === 0) return null

  const ops = usable
    .map(op => {
      const dateIso = (op.status === 'completed' && op.completedDate)
        ? op.completedDate
        : op.recommendedDate
      // A correction logged before the planting date clamps to day 0.
      const offset = Math.max(0, daysBetween(event.plantingDate, dateIso))
      return { type: op.type as string, labelEs: op.labelEs, offset, product: op.product ?? undefined }
    })
    .sort((a, b) => a.offset - b.offset)

  // Harvest window from the real harvest offsets; a single harvest day
  // gives a zero-width window the farmer can widen in the editor.
  const harvestOffsets = ops.filter(o => o.type === 'harvest').map(o => o.offset)
  const windowStart = harvestOffsets.length > 0 ? Math.min(...harvestOffsets) : Math.max(...ops.map(o => o.offset))
  const windowEnd = harvestOffsets.length > 0 ? Math.max(...harvestOffsets) : windowStart

  return {
    liftedCount: ops.length,
    skippedCount,
    draft: {
      windowStart: String(windowStart),
      windowEnd: String(windowEnd),
      ops: ops.map(o => ({
        type: o.type,
        labelEs: o.labelEs,
        offsetDays: String(o.offset),
        product: o.product,
      })),
    },
  }
}

// Retroactively reference the source planting: the recipe IS what was
// done there, so linking is honest by construction — the version is born
// referenced (frozen, R1) and the planting's yield and adherence become
// its founding evidence. Saved through the normal field PATCH so the
// reference round-trips like completedOperationId does.
export async function linkPlantingToVersion(
  field: PlacedField,
  eventId: string,
  recipeVersionId: string
): Promise<void> {
  // Lazy import: lib/api touches `window` at module load, which would
  // break this module's pure derivation half under node (vitest).
  const { api } = await import('@/lib/api')
  const plantingEvents = field.plantingEvents.map(e =>
    e.id === eventId ? { ...e, recipeVersionId } : e
  )
  const result = await api.patch<{ field: PlacedField }>(
    `/api/v1/farms/${field.farmId}/fields/${field.id}`,
    { plantingEvents }
  )
  useFieldStore.getState().updateField(field.id, result.field)
}
