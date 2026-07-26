import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useCropStore } from '@/store/useCropStore'

export type ApiCrop = {
  id: string
  name: string
  nameEs: string
  emoji: string
  category: string
  isBuiltIn: boolean
  userId: string | null
  schedule: {
    harvestWindowStartDays: number
    harvestWindowEndDays: number
    operations: Array<{
      id: string
      type: string
      label?: string
      labelEs: string
      offsetDays: number
      notes?: string
      notesEs?: string
      product?: string
    }>
  } | null
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