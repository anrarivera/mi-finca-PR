import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFarmStore } from '@/store/useFarmStore'
import { useRecipeStore, type ResolvedRecipeEntry, type ResolvedOperationTemplate } from '@/store/useRecipeStore'

// ── Recipes API (Recetas de Cultivo) ────────────────────────────────────
// Resolved recipes hydrate useRecipeStore for stamping; the list/default/
// mutation hooks back the authoring UI (Cuaderno → Recetas). Every
// mutation invalidates the whole 'recipes' family so the resolved ladder
// and the management list stay in step.

export type ApiRecipeVersion = {
  id: string
  number: number
  harvestWindowStartDays: number
  harvestWindowEndDays: number
  operations: ResolvedOperationTemplate[]
  note: string | null
  referenced: boolean
  createdAt: string
}

export type ApiRecipe = {
  id: string
  authorUserId: string | null // null = system recipe ("Calendario base")
  cropTypeId: string
  name: string
  description: string | null
  visibility: string
  archived: boolean
  currentVersion: ApiRecipeVersion | null
  createdAt: string
  updatedAt: string
}

export type RecipeScheduleInput = {
  harvestWindowStartDays: number
  harvestWindowEndDays: number
  operations: Array<{
    id?: string
    type: string
    label?: string
    labelEs: string
    offsetDays: number
    notes?: string
    notesEs?: string
    product?: string
  }>
}

export type RecipeDefaults = {
  personal: Array<{ cropTypeId: string; recipeId: string }>
  farm: Array<{ cropTypeId: string; recipeId: string; fieldId: string | null }>
}

const recipeKeys = {
  all: () => ['recipes'] as const,
  list: () => ['recipes', 'list'] as const,
  resolved: (farmId: string) => ['recipes', 'resolved', farmId] as const,
  defaults: (farmId: string | null) => ['recipes', 'defaults', farmId ?? ''] as const,
}

type ResolvedResponse = { farmId: string; entries: ResolvedRecipeEntry[] }

export function useResolvedRecipes() {
  const activeFarmId = useFarmStore(s => s.activeFarmId)
  const { setResolved } = useRecipeStore()

  return useQuery({
    queryKey: recipeKeys.resolved(activeFarmId ?? ''),
    queryFn: async () => {
      const result = await api.get<ResolvedResponse>(
        `/api/v1/recipes/resolved?farmId=${activeFarmId}`
      )
      setResolved(result.farmId, result.entries)
      return result
    },
    enabled: !!activeFarmId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useRecipes() {
  return useQuery({
    queryKey: recipeKeys.list(),
    queryFn: () => api.get<ApiRecipe[]>('/api/v1/recipes'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useRecipeDefaults(farmId: string | null) {
  return useQuery({
    queryKey: recipeKeys.defaults(farmId),
    queryFn: () =>
      api.get<RecipeDefaults>(
        `/api/v1/recipes/defaults${farmId ? `?farmId=${farmId}` : ''}`
      ),
    staleTime: 5 * 60 * 1000,
  })
}

function useInvalidateRecipes() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: recipeKeys.all() })
}

export function useCreateRecipe() {
  const invalidate = useInvalidateRecipes()
  return useMutation({
    mutationFn: (payload: {
      cropTypeId: string
      name: string
      description?: string | null
      schedule: RecipeScheduleInput
    }) => api.post<ApiRecipe>('/api/v1/recipes', payload),
    onSuccess: invalidate,
  })
}

export function useUpdateRecipe() {
  const invalidate = useInvalidateRecipes()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; description?: string | null }) =>
      api.put<ApiRecipe>(`/api/v1/recipes/${id}`, payload),
    onSuccess: invalidate,
  })
}

// R1 lives server-side: an unreferenced version is edited in place; a
// referenced one freezes and this mints the next number.
export function useUpdateRecipeSchedule() {
  const invalidate = useInvalidateRecipes()
  return useMutation({
    mutationFn: ({ id, schedule, note }: { id: string; schedule: RecipeScheduleInput; note?: string | null }) =>
      api.put<ApiRecipe>(`/api/v1/recipes/${id}/schedule`, { schedule, note }),
    onSuccess: invalidate,
  })
}

export function useDeleteRecipe() {
  const invalidate = useInvalidateRecipes()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ id: string; deleted?: boolean; archived?: boolean }>(`/api/v1/recipes/${id}`),
    onSuccess: invalidate,
  })
}

export function useSetRecipeDefault() {
  const invalidate = useInvalidateRecipes()
  return useMutation({
    mutationFn: (payload: {
      cropTypeId: string
      recipeId: string | null // null clears
      scope: 'user' | 'farm' | 'field'
      farmId?: string
      fieldId?: string
    }) => api.put('/api/v1/recipes/defaults', payload),
    onSuccess: invalidate,
  })
}
