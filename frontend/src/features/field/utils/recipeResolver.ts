import { useRecipeStore, type ResolvedOperationTemplate } from '@/store/useRecipeStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore } from '@/store/useFarmStore'
import { getScheduleForCrop } from '../data/cropSchedules'

// ── What stamps at planting time ────────────────────────────────────────
// Bridges the resolved-recipe store (server-materialized R2 ladder, keyed
// by farm) to the stamping code, which only knows fieldId + cropTypeId.
// Falls back to the static 9-crop schedules when the store has nothing
// (anonymous demo browsing, offline, or a farm not yet loaded) — those
// fallback stamps carry no version reference.

export type StampSource = {
  recipeVersionId: string | null
  harvestWindowStartDays: number
  harvestWindowEndDays: number
  operations: ResolvedOperationTemplate[]
}

export function resolveStampSource(fieldId: string, cropTypeId: string): StampSource | undefined {
  const field = useFieldStore.getState().fields.find(f => f.id === fieldId)
  const farmId = field?.farmId ?? useFarmStore.getState().activeFarmId
  const entry = farmId
    ? useRecipeStore.getState().resolve(farmId, fieldId, cropTypeId)
    : undefined
  if (entry) {
    return {
      recipeVersionId: entry.versionId,
      harvestWindowStartDays: entry.harvestWindowStartDays,
      harvestWindowEndDays: entry.harvestWindowEndDays,
      operations: entry.operations,
    }
  }
  const fallback = getScheduleForCrop(cropTypeId)
  if (!fallback) return undefined
  return {
    recipeVersionId: null,
    harvestWindowStartDays: fallback.harvestWindowStartDays,
    harvestWindowEndDays: fallback.harvestWindowEndDays,
    operations: fallback.operations,
  }
}

// Harvest-window lookup for the inventory grid — same resolution, window
// only, tolerant of fields on farms whose recipes aren't loaded.
export function resolveHarvestWindow(
  cropTypeId: string,
  farmId?: string,
  fieldId?: string
): { harvestWindowStartDays: number; harvestWindowEndDays: number } | undefined {
  const entry = farmId
    ? useRecipeStore.getState().resolve(farmId, fieldId ?? null, cropTypeId)
    : undefined
  return entry ?? getScheduleForCrop(cropTypeId)
}
