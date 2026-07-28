import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFarmStore } from '@/store/useFarmStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import type { AnimalType, LivestockUnit } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Livestock API hooks — connects the livestock UI (previously
// localStorage-only) to GET/POST/PATCH/DELETE /farms/:farmId/livestock.
// Follows the same "fetch → hydrate Zustand" pattern as useFarms/useFields:
// components keep reading from useLivestockStore; these hooks keep that
// store in sync with the server.
// ──────────────────────────────────────────────────────────────────────────

// Shape returned by the backend (backend/src/routes/livestock.ts). Dates are
// full ISO timestamps and nullable fields come back as null.
type ApiLivestockUnit = {
  id: string
  farmId: string
  name: string
  animalType: string
  currentCount: number
  acquisitionDate: string
  notes: string | null
}

// Backend rows → frontend LivestockUnit (date-only string, undefined notes).
function toLivestockUnit(u: ApiLivestockUnit): LivestockUnit {
  return {
    id: u.id,
    farmId: u.farmId,
    name: u.name,
    animalType: u.animalType as AnimalType,
    currentCount: u.currentCount,
    acquisitionDate: u.acquisitionDate.split('T')[0],
    notes: u.notes ?? undefined,
  }
}

// ── Fetch all livestock for the user's farms ──────────────────────────
// The backend scopes livestock per farm, but the dashboard section shows
// units across every farm — so this fans out one request per farm and
// merges. Hydrates useLivestockStore, which stays the single source the
// components read from.
export function useLivestock() {
  const farms = useFarmStore(s => s.farms)
  const farmIds = farms.map(f => f.id)

  return useQuery({
    // Key includes the farm list so adding/removing a farm refetches.
    queryKey: ['livestock', [...farmIds].sort().join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        farmIds.map(id => api.get<ApiLivestockUnit[]>(`/api/v1/farms/${id}/livestock`))
      )
      const units = results.flat().map(toLivestockUnit)
      useLivestockStore.getState().setUnits(units)
      return units
    },
    enabled: farmIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Create ────────────────────────────────────────────────────────────
export function useCreateLivestock() {
  const queryClient = useQueryClient()
  const { addUnit } = useLivestockStore()

  return useMutation({
    mutationFn: async (data: Omit<LivestockUnit, 'id'>) => {
      const created = await api.post<ApiLivestockUnit>(
        `/api/v1/farms/${data.farmId}/livestock`,
        data
      )
      return toLivestockUnit(created)
    },
    onSuccess: (unit) => {
      addUnit(unit) // server-generated UUID replaces the old local `lv_` ids
      queryClient.invalidateQueries({ queryKey: ['livestock'] })
    },
  })
}

// ── Update ────────────────────────────────────────────────────────────
// farmId comes from the existing unit — the backend routes livestock under
// its owning farm and does not support moving a unit between farms.
export function useUpdateLivestock() {
  const queryClient = useQueryClient()
  const { updateUnit } = useLivestockStore()

  return useMutation({
    mutationFn: async ({ id, farmId, updates }: {
      id: string
      farmId: string
      updates: Partial<Omit<LivestockUnit, 'id' | 'farmId'>>
    }) => {
      const updated = await api.patch<ApiLivestockUnit>(
        `/api/v1/farms/${farmId}/livestock/${id}`,
        updates
      )
      return toLivestockUnit(updated)
    },
    onSuccess: (unit) => {
      updateUnit(unit.id, unit)
      queryClient.invalidateQueries({ queryKey: ['livestock'] })
    },
  })
}

// ── Delete (soft delete server-side) ──────────────────────────────────
export function useDeleteLivestock() {
  const queryClient = useQueryClient()
  const { removeUnit } = useLivestockStore()

  return useMutation({
    mutationFn: async ({ id, farmId }: { id: string; farmId: string }) => {
      await api.delete(`/api/v1/farms/${farmId}/livestock/${id}`)
      return id
    },
    onSuccess: (id) => {
      removeUnit(id)
      queryClient.invalidateQueries({ queryKey: ['livestock'] })
    },
  })
}
