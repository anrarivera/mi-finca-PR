import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFieldStore } from '@/store/useFieldStore'
import type { PlacedField } from '../types'

// ── Query key factory ─────────────────────────────────────────────
const fieldKeys = {
  all: (farmId: string) => ['fields', farmId] as const,
}

// ── Fetch + hydrate store ─────────────────────────────────────────
export function useFields(farmId: string | null) {
  const { addField, removeFieldsByFarmId } = useFieldStore()

  return useQuery({
    queryKey: fieldKeys.all(farmId ?? ''),
    queryFn: async () => {
      const result = await api.get<{ fields: PlacedField[] }>(`/api/v1/farms/${farmId}/fields`)
      removeFieldsByFarmId(farmId!)
      result.fields.forEach(f => addField(f))
      return result.fields
    },
    enabled: !!farmId,
  })
}

// ── Create ────────────────────────────────────────────────────────
export function useCreateField(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: Omit<PlacedField, 'id' | 'farmId'>) => {
      const result = await api.post<{ field: PlacedField }>(
        `/api/v1/farms/${farmId}/fields`,
        payload
      )
      return result.field
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fieldKeys.all(farmId) })
    },
  })
}

// ── Update ────────────────────────────────────────────────────────
export function useUpdateField(farmId: string) {
  const queryClient = useQueryClient()
  const { updateField } = useFieldStore()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PlacedField> }) => {
      const result = await api.patch<{ field: PlacedField }>(
        `/api/v1/farms/${farmId}/fields/${id}`,
        updates
      )
      return result.field
    },
    onSuccess: (field) => {
      updateField(field.id, field)
      queryClient.invalidateQueries({ queryKey: fieldKeys.all(farmId) })
    },
  })
}

// ── Delete ────────────────────────────────────────────────────────
export function useDeleteField(farmId: string) {
  const queryClient = useQueryClient()
  const { removeField } = useFieldStore()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete<{ success: boolean }>(`/api/v1/farms/${farmId}/fields/${id}`)
      return id
    },
    onSuccess: (id) => {
      removeField(id)
      queryClient.invalidateQueries({ queryKey: fieldKeys.all(farmId) })
    },
    onError: (err) => {
      console.error('Delete field failed:', err)
    },
  })
}