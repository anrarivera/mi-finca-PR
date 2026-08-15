import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFieldStore } from '@/store/useFieldStore'
import { toast } from '@/store/useToastStore'

// ──────────────────────────────────────────────────────────────────────────
// Operations API hooks — the persistence layer for the check-off flow
// (SDD §6.2). Completing/skipping a recommended operation now hits the
// backend, which atomically creates the operations-log entry, flips the
// recommendation status, and (for harvests) records a yield. The local
// field store is updated optimistically so the UI responds instantly.
// ──────────────────────────────────────────────────────────────────────────

// A row in the farm's operations log (backend `operations` table).
export type FarmOperation = {
  id: string
  farmId: string
  fieldId: string | null
  plantingEventId: string | null
  livestockUnitId: string | null
  recommendedOperationId: string | null
  type: string
  actualDate: string
  notes: string | null
  product: string | null
  quantity: number | null
  unit: string | null
  qualityRating: number | null
  /** Fully covered field-row ids — [] = whole field / not row-specific. */
  rowIds: string[]
  /** Individually covered plant ids outside those rows (partial rows, loose plants). */
  plantIds: string[]
  /** Who logged it — the server includes { id, fullName } on farm-scoped
      operation lists so the cuaderno can show "por Luis". */
  performedBy?: { id: string; fullName: string } | null
  createdAt: string
}

export type CheckOffData = {
  completedDate: string
  notes?: string
  product?: string
  quantity?: number
  unit?: string
  /** Total sale revenue in dollars (harvest check-offs, optional). */
  revenue?: number
  /** Fully covered rows (harvest selection). */
  rowIds?: string[]
  /** Individual plants outside those rows (harvest selection). */
  plantIds?: string[]
}

// ── Farm-wide operations log ──────────────────────────────────────────
// Read hook for dashboards / history views. Not hydrated into Zustand —
// the log is server-owned data with no offline editing story yet.
export function useOperations(farmId: string | null) {
  return useQuery({
    queryKey: ['operations', farmId],
    queryFn: () => api.get<FarmOperation[]>(`/api/v1/farms/${farmId}/operations`),
    enabled: !!farmId,
    staleTime: 60 * 1000,
  })
}

// Shared helper: apply a status change to one recommended operation inside
// the local field store, so the operations view updates without waiting for
// the refetch.
function patchLocalOperation(
  fieldId: string,
  eventId: string,
  operationId: string,
  patch: Record<string, unknown>
) {
  const { getField, updateField } = useFieldStore.getState()
  const field = getField(fieldId)
  if (!field) return
  updateField(fieldId, {
    plantingEvents: (field.plantingEvents ?? []).map(e =>
      e.id !== eventId ? e : {
        ...e,
        operations: e.operations.map(op =>
          op.id !== operationId ? op : { ...op, ...patch }
        ),
      }
    ),
  })
}

// ── Log a standalone operation ────────────────────────────────────────
// Direct POST /operations — used for events not driven by the calendar,
// e.g. recording why a plant was removed (died / replaced / harvested).
export function useCreateOperation(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      type: string
      actualDate: string
      fieldId?: string | null
      cropTypeId?: string
      notes?: string | null
      quantity?: number | null
      unit?: string | null
      rowIds?: string[]
      plantIds?: string[]
    }) => {
      return api.post<FarmOperation>(`/api/v1/farms/${farmId}/operations`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations', farmId] })
    },
  })
}

// ── Due-soon operations ───────────────────────────────────────────────
// Server-authoritative overdue / due-within-14-days operations across the
// whole farm, INCLUDING livestock recommendations the client-derived field
// numbers can't see (GET /recommended-operations/due-soon). Feeds the
// dashboard's Labores panel and the badge counts.

// One open recommendation with the labeling context the server includes.
export type DueSoonOperation = {
  id: string
  type: string
  labelEs: string
  recommendedDate: string
  status: 'pending' | 'due'
  plantingEventId: string | null
  livestockUnitId: string | null
  product: string | null
  quantity: number | null
  unit: string | null
  notes: string | null
  plantingEvent: {
    id: string
    fieldId: string
    cropTypeId: string
    plantingDate: string
  } | null
  livestockUnit: { id: string; name: string; animalType: string } | null
}

export function useDueSoonOperations(farmId: string | null) {
  return useQuery({
    queryKey: ['recommended-operations', 'due-soon', farmId],
    queryFn: () =>
      api.get<{
        overdueCount: number
        dueSoonCount: number
        operations: DueSoonOperation[]
      }>(
        `/api/v1/farms/${farmId}/recommended-operations/due-soon`
      ),
    enabled: !!farmId,
    staleTime: 60 * 1000,
  })
}

// ── Complete (check off) a recommended operation ──────────────────────
export function useCompleteRecommendedOp(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: {
      fieldId: string
      eventId: string
      operationId: string
      data: CheckOffData
    }) => {
      return api.post<{ operation: FarmOperation }>(
        `/api/v1/farms/${farmId}/recommended-operations/${vars.operationId}/complete`,
        vars.data
      )
    },
    // Optimistic: flip the row locally the moment the user confirms.
    onMutate: (vars) => {
      patchLocalOperation(vars.fieldId, vars.eventId, vars.operationId, {
        status: 'completed',
        ...vars.data,
      })
    },
    onSuccess: () => {
      // The server also created an operations-log row (and possibly a
      // harvest yield) — refresh everything derived from them.
      queryClient.invalidateQueries({ queryKey: ['fields', farmId] })
      queryClient.invalidateQueries({ queryKey: ['operations', farmId] })
      queryClient.invalidateQueries({ queryKey: ['recommended-operations'] })
    },
    onError: (_err, vars) => {
      // Roll the optimistic flip back — the refetch will restore truth, but
      // don't leave a green check on screen when the server said no.
      patchLocalOperation(vars.fieldId, vars.eventId, vars.operationId, {
        status: 'pending', completedDate: undefined,
      })
      queryClient.invalidateQueries({ queryKey: ['fields', farmId] })
    },
  })
}

// ── Skip a recommended operation ──────────────────────────────────────
export function useSkipRecommendedOp(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: {
      fieldId: string
      eventId: string
      operationId: string
    }) => {
      return api.post(
        `/api/v1/farms/${farmId}/recommended-operations/${vars.operationId}/skip`
      )
    },
    onMutate: (vars) => {
      patchLocalOperation(vars.fieldId, vars.eventId, vars.operationId, {
        status: 'skipped',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fields', farmId] })
      queryClient.invalidateQueries({ queryKey: ['recommended-operations'] })
    },
    onError: (_err, vars) => {
      patchLocalOperation(vars.fieldId, vars.eventId, vars.operationId, {
        status: 'pending',
      })
      queryClient.invalidateQueries({ queryKey: ['fields', farmId] })
    },
  })
}

// ── Undo (reopen) a completed or skipped recommended operation ────────
// Server deletes the completing log entry + its harvest yield and reopens
// the recommendation as pending/due by date. Partial logs are preserved.
export function useUndoRecommendedOp(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: {
      fieldId: string
      eventId: string
      operationId: string
    }) => {
      return api.post<{ status: string }>(
        `/api/v1/farms/${farmId}/recommended-operations/${vars.operationId}/undo`
      )
    },
    onSuccess: (recOp, vars) => {
      // Server decides pending vs due — mirror its answer locally.
      patchLocalOperation(vars.fieldId, vars.eventId, vars.operationId, {
        status: recOp.status,
        completedDate: undefined,
        completedOperationId: null,
      })
      queryClient.invalidateQueries({ queryKey: ['fields', farmId] })
      queryClient.invalidateQueries({ queryKey: ['operations', farmId] })
      queryClient.invalidateQueries({ queryKey: ['recommended-operations'] })
    },
  })
}

// ── Partial log against an open recommendation ────────────────────────
// The multi-day-harvest flow: records a day's progress (date + quantity)
// in the operations log (and harvest yields) WITHOUT closing the calendar
// item, so a 3-day harvest is three partial logs + one final check-off.
export function useLogPartialRecommendedOp(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: {
      operationId: string
      data: {
        date: string
        product?: string
        quantity?: number
        unit?: string
        /** Total sale revenue in dollars (harvest partials, optional). */
        revenue?: number
        notes?: string
        rowIds?: string[]
        plantIds?: string[]
      }
    }) => {
      return api.post<FarmOperation>(
        `/api/v1/farms/${farmId}/recommended-operations/${vars.operationId}/log-partial`,
        vars.data
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations', farmId] })
      queryClient.invalidateQueries({ queryKey: ['recommended-operations'] })
    },
  })
}

// ── Edit a logged operation ───────────────────────────────────────────
// The server mirrors changes onto the linked harvest yield and, when this
// entry completed a recommendation, onto the recommendation's shown values.
export function useUpdateOperation(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: {
      id: string
      updates: Partial<Pick<FarmOperation,
        'type' | 'actualDate' | 'notes' | 'product' | 'quantity' | 'unit' | 'qualityRating' | 'rowIds' | 'plantIds'>>
    }) => {
      return api.patch<FarmOperation>(
        `/api/v1/farms/${farmId}/operations/${vars.id}`,
        vars.updates
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations', farmId] })
      queryClient.invalidateQueries({ queryKey: ['fields', farmId] })
      queryClient.invalidateQueries({ queryKey: ['recommended-operations'] })
    },
  })
}

// ── Delete a logged operation ─────────────────────────────────────────
// Server-side this also removes the linked harvest yield and reopens any
// recommendation this entry had completed.
export function useDeleteOperation(farmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/farms/${farmId}/operations/${id}`)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations', farmId] })
      queryClient.invalidateQueries({ queryKey: ['fields', farmId] })
      queryClient.invalidateQueries({ queryKey: ['recommended-operations'] })
    },
  })
}

// ── CSV export ────────────────────────────────────────────────────────
// The export endpoint streams a file — api.download() carries the auth
// header and the same silent token refresh as every JSON call.
export function useExportOperations(farmId: string) {
  return useMutation({
    mutationFn: async () => {
      const { api } = await import('@/lib/api')
      const { blob, filename } =
        await api.download(`/api/v1/farms/${farmId}/operations/export?format=csv`)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename ?? 'operaciones.csv'
      a.click()
      URL.revokeObjectURL(a.href)
    },
    onError: () => toast.error('No se pudo exportar el registro de operaciones'),
  })
}
