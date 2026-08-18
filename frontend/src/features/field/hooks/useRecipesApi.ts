import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFarmStore } from '@/store/useFarmStore'
import { useRecipeStore, type ResolvedRecipeEntry } from '@/store/useRecipeStore'

// ── Resolved recipes for the active farm ────────────────────────────────
// Hydrates useRecipeStore with the server-materialized R2 ladder so
// plantingEventManager stamps operations from the farm's governing
// recipes (the owner's plan) instead of the static 9-crop fallback.

const recipeKeys = {
  resolved: (farmId: string) => ['recipes', 'resolved', farmId] as const,
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
