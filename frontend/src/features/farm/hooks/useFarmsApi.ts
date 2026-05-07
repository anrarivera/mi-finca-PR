import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFarmStore } from '@/store/useFarmStore'
import type { Farm } from '@/store/useFarmStore'

type ApiFarm = {
  id: string
  name: string
  location: string
  farmType: string
  boundary: Array<{ lat: number; lng: number }>
  totalAreaAcres: number
  isFavorite: boolean
  description: string | null
  fieldIds: string[]
  createdAt: string
  updatedAt: string
}

// ── Fetch all farms ───────────────────────────────────────────────────
export function useFarms() {
  const { farms, addFarm, setActiveFarm, favoriteFarmId } = useFarmStore()

  return useQuery({
    queryKey: ['farms'],
    queryFn: async () => {
      const data = await api.get<ApiFarm[]>('/api/v1/farms')

      // Sync API response into Zustand store
      const { farms: existingFarms } = useFarmStore.getState()

      data.forEach(apiFarm => {
        const exists = existingFarms.find(f => f.id === apiFarm.id)
        if (!exists) {
          const farm: Farm = {
            id: apiFarm.id,
            name: apiFarm.name,
            location: apiFarm.location,
            farmType: apiFarm.farmType as Farm['farmType'],
            boundary: apiFarm.boundary,
            totalAreaAcres: apiFarm.totalAreaAcres,
            isFavorite: apiFarm.isFavorite,
            description: apiFarm.description ?? undefined,
            fieldIds: apiFarm.fieldIds,
            createdAt: apiFarm.createdAt,
          }
          addFarm(farm)
        }
      })

      // Set active farm to favorite or first
      const { activeFarm } = useFarmStore.getState()
      if (!activeFarm && data.length > 0) {
        const fav = data.find(f => f.isFavorite) ?? data[0]
        const farmInStore = useFarmStore.getState().farms.find(f => f.id === fav.id)
        if (farmInStore) setActiveFarm(farmInStore)
      }

      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Create farm ───────────────────────────────────────────────────────
export function useCreateFarm() {
  const queryClient = useQueryClient()
  const { addFarm, setActiveFarm } = useFarmStore()

  return useMutation({
    mutationFn: async (data: {
      name: string
      location: string
      farmType?: string
      description?: string
    }) => {
      return api.post<ApiFarm>('/api/v1/farms', data)
    },
    onSuccess: (apiFarm) => {
      const farm: Farm = {
        id: apiFarm.id,
        name: apiFarm.name,
        location: apiFarm.location,
        farmType: apiFarm.farmType as Farm['farmType'],
        boundary: apiFarm.boundary,
        totalAreaAcres: apiFarm.totalAreaAcres,
        isFavorite: apiFarm.isFavorite,
        description: apiFarm.description ?? undefined,
        fieldIds: apiFarm.fieldIds,
        createdAt: apiFarm.createdAt,
      }
      addFarm(farm)
      setActiveFarm(farm)
      queryClient.invalidateQueries({ queryKey: ['farms'] })
    },
  })
}

// ── Update farm ───────────────────────────────────────────────────────
export function useUpdateFarm() {
  const queryClient = useQueryClient()
  const { updateFarm } = useFarmStore()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: Partial<{
        name: string
        location: string
        farmType: string
        description: string
        boundary: Array<{ lat: number; lng: number }>
        isFavorite: boolean
      }>
    }) => {
      return api.patch<ApiFarm>(`/api/v1/farms/${id}`, data)
    },
    onSuccess: (apiFarm) => {
      // Sync updated farm back to Zustand
      updateFarm(apiFarm.id, {
        boundary: apiFarm.boundary,
        totalAreaAcres: apiFarm.totalAreaAcres,
        isFavorite: apiFarm.isFavorite,
        name: apiFarm.name,
        location: apiFarm.location,
      })
      queryClient.invalidateQueries({ queryKey: ['farms'] })
    },
  })
}

// ── Delete farm ───────────────────────────────────────────────────────
export function useDeleteFarm() {
  const queryClient = useQueryClient()
  const { deleteFarm } = useFarmStore()

  return useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/api/v1/farms/${id}`)
    },
    onSuccess: (_, id) => {
      deleteFarm(id)
      queryClient.invalidateQueries({ queryKey: ['farms'] })
    },
  })
}