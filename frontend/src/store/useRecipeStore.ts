import { create } from 'zustand'

// ── Resolved recipes per farm (Recetas de Cultivo, R2) ─────────────────
// The server materializes the ladder — field default → farm default →
// the farm OWNER's personal default → system recipe — into entries:
// fieldId null = the farm-level winner, fieldId set = a field default
// that wins inside that field. This store just caches them per farm;
// stamping picks the field entry over the farm entry.

export type ResolvedOperationTemplate = {
  id: string
  type: string
  label?: string
  labelEs: string
  offsetDays: number
  notes?: string
  notesEs?: string
  product?: string
}

export type ResolvedRecipeEntry = {
  cropTypeId: string
  fieldId: string | null
  recipeId: string
  recipeName: string
  authorUserId: string | null
  versionId: string
  versionNumber: number
  harvestWindowStartDays: number
  harvestWindowEndDays: number
  operations: ResolvedOperationTemplate[]
}

type RecipeState = {
  byFarm: Record<string, ResolvedRecipeEntry[]>
  // Bumped on every load — lets non-React caches (the i18n op-label map)
  // notice new recipe data without subscribing.
  revision: number

  setResolved: (farmId: string, entries: ResolvedRecipeEntry[]) => void
  resolve: (farmId: string, fieldId: string | null, cropTypeId: string) => ResolvedRecipeEntry | undefined
}

export const useRecipeStore = create<RecipeState>()((set, get) => ({
  byFarm: {},
  revision: 0,

  setResolved: (farmId, entries) =>
    set(s => ({ byFarm: { ...s.byFarm, [farmId]: entries }, revision: s.revision + 1 })),

  resolve: (farmId, fieldId, cropTypeId) => {
    const entries = get().byFarm[farmId]
    if (!entries) return undefined
    return (
      (fieldId
        ? entries.find(e => e.fieldId === fieldId && e.cropTypeId === cropTypeId)
        : undefined) ??
      entries.find(e => e.fieldId === null && e.cropTypeId === cropTypeId)
    )
  },
}))
