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
  myRole?: 'owner' | 'admin' | 'operator'
}

// ── Fetch all farms ───────────────────────────────────────────────────
export function useFarms() {
  const { addFarm, setActiveFarm } = useFarmStore()

  return useQuery({
    queryKey: ['farms'],
    queryFn: async () => {
      const data = await api.get<ApiFarm[]>('/api/v1/farms')
      console.log('Farms from API:', data)
      // Sync API response into Zustand store
      const { clearFarms, activeFarmId: prevActiveId } = useFarmStore.getState()
      clearFarms();

       data.forEach(apiFarm => {
          addFarm({
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
            myRole: apiFarm.myRole ?? 'owner',
          })
      })

      // Re-activate the farm that was selected before the refetch — an
      // invalidation (create/update/join) must not steal the selection.
      // Fall back to favorite or first (initial load).
      if (data.length > 0) {
        const farmsInStore = useFarmStore.getState().farms
        const favId = (data.find(f => f.isFavorite) ?? data[0]).id
        const target =
          farmsInStore.find(f => f.id === prevActiveId) ??
          farmsInStore.find(f => f.id === favId)
        if (target) setActiveFarm(target)
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
        myRole: 'owner', // the creator owns the farm
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