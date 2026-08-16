import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/store/useToastStore'
import type { Finding, FindingStatus } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Findings API hooks. Findings are server-owned (like the operations log):
// one farm-wide query feeds both the per-field lists and the map paint;
// mutations invalidate it. "Crear labor" additionally invalidates the
// fields query because the new treatment recommendation arrives inside the
// field's planting events.
// ──────────────────────────────────────────────────────────────────────────

export function useFindings(farmId: string | null) {
  return useQuery({
    queryKey: ['findings', farmId],
    queryFn: () => api.get<Finding[]>(`/api/v1/farms/${farmId}/findings`),
    enabled: !!farmId,
    staleTime: 60 * 1000,
  })
}

// Multi-farm findings ledger — the Cuaderno's "Todas las fincas" view.
// Mutations invalidate the bare ['findings'] prefix so this refreshes too.
export function useFindingsLedger(farmIds: string[]) {
  return useQuery({
    queryKey: ['findings', 'ledger', [...farmIds].sort().join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        farmIds.map(id => api.get<Finding[]>(`/api/v1/farms/${id}/findings`))
      )
      return results.flat()
    },
    enabled: farmIds.length > 0,
    staleTime: 60 * 1000,
  })
}

export type CreateFindingData = {
  fieldId: string
  pestId: string
  severity: number
  foundDate?: string
  notes?: string
  rowIds?: string[]
  plantIds?: string[]
}

export function useCreateFinding(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateFindingData) =>
      api.post<Finding>(`/api/v1/farms/${farmId}/findings`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
  })
}

export function useUpdateFinding(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: {
      id: string
      updates: Partial<{
        pestId: string
        severity: number
        status: FindingStatus
        foundDate: string
        notes: string | null
        rowIds: string[]
        plantIds: string[]
      }>
    }) =>
      api.patch<Finding>(`/api/v1/farms/${farmId}/findings/${vars.id}`, vars.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
  })
}

export function useDeleteFinding(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/farms/${farmId}/findings/${id}`)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
  })
}

// ── CSV export — the sanitary record on paper ─────────────────────────
// One row per observation (full re-inspection history). Streams a file,
// so it bypasses the JSON ApiClient — same pattern as the operations
// export: fetch with the Bearer token, hand the blob to the browser.
export function useExportFindings(farmId: string) {
  return useMutation({
    mutationFn: async () => {
      const { api } = await import('@/lib/api')
      const { blob, filename } =
        await api.download(`/api/v1/farms/${farmId}/findings/export?format=csv`)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename ?? 'sanidad.csv'
      a.click()
      URL.revokeObjectURL(a.href)
    },
    onError: () => toast.error('No se pudo exportar el registro sanitario'),
  })
}

// ── Re-inspection ("seguimiento") — the Parcial of findings ───────────
// Appends a dated severity + scope observation; the server mirrors it onto
// the finding so map paint and field health read the new state instantly
// after the refetch. Status is untouched — that stays the farmer's call.
export function useAddObservation(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: {
      findingId: string
      data: {
        date?: string
        severity: number
        notes?: string
        rowIds?: string[]
        plantIds?: string[]
      }
    }) =>
      api.post<Finding>(
        `/api/v1/farms/${farmId}/findings/${vars.findingId}/observations`,
        vars.data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
  })
}

// ── "Crear labor" — one coarse treatment recommendation from a finding ──
// The client picks the planting event (it knows which event the affected
// plants belong to) and composes the label/notes; the farmer confirms the
// real scope at check-off with the normal selector.
export function useCreateTreatmentOp(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: {
      findingId: string
      data: {
        plantingEventId: string
        labelEs: string
        type?: string
        recommendedDate?: string
        notes?: string
      }
    }) =>
      api.post<{ finding: Finding }>(
        `/api/v1/farms/${farmId}/findings/${vars.findingId}/create-operation`,
        vars.data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
      // The new recommendation lives inside the field's planting events.
      queryClient.invalidateQueries({ queryKey: ['fields', farmId] })
      queryClient.invalidateQueries({ queryKey: ['recommended-operations'] })
    },
  })
}
