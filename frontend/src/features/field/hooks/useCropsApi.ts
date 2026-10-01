import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export function useCreateCrop() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: { nameEs: string; name?: string; emoji?: string; category?: string }) =>
      api.post<ApiCrop>('/api/v1/crops', payload),
    onSuccess: (crop) => {
      // The picker reads the store synchronously — append immediately so
      // the new crop is selectable before the refetch lands.
      const store = useCropStore.getState()
      store.setCrops([...store.crops, crop])
      queryClient.invalidateQueries({ queryKey: cropKeys.all() })
    },
  })
}