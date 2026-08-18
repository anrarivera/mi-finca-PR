import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useCropStore } from '@/store/useCropStore'

// Crops are IDENTITY only — practice (schedules, harvest windows) lives
// on recipes, resolved per farm via useRecipesApi/useRecipeStore.
export type ApiCrop = {
  id: string
  name: string
  nameEs: string
  emoji: string
  category: string
  isBuiltIn: boolean
  userId: string | null
}

const cropKeys = {
  all: () => ['crops'] as const,
}

export function useCrops() {
  const { setCrops } = useCropStore()

  return useQuery({
    queryKey: cropKeys.all(),
    queryFn: async () => {
      const result = await api.get<ApiCrop[]>('/api/v1/crops')
      setCrops(result)
      return result
    },
    staleTime: 10 * 60 * 1000, // 10 minutes — crops rarely change
  })
}