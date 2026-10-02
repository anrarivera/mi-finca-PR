import {
  useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient,
} from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFarmStore } from '@/store/useFarmStore'
import { deleteFarmCascade } from '@/store/farmActions'

// ──────────────────────────────────────────────────────────────────────────
// Sample farm ("Finca de ejemplo") — a sandbox farm with sample data inside
// a real account, switched on and off from Settings. The server owns its
// whole life: PUT seeds or deletes it, POST …/reset reseeds it, and on its
// own it goes back to the default data every `ttlDays` days. It arrives
// in GET /farms like any other farm, flagged `isSample`.
// Demo accounts can't use any of this (GET answers "disabled", the rest
// 403) — their whole account already is the sample.
// ──────────────────────────────────────────────────────────────────────────

export type SampleFarmStatus = {
  enabled: boolean
  farmId: string | null
  /** ISO timestamps — real instants, to be shown in the device's time. */
  seededAt: string | null
  resetsAt: string | null
  ttlDays: number
}

const SAMPLE_FARM_PATH = '/api/v1/users/me/sample-farm'
// The status query and both mutations answer to the same key.
const sampleFarmKey = ['sample-farm'] as const

// Every query family that holds a farm's data (first key element).
const FARM_SCOPED_KEYS = [
  'fields', 'operations', 'recommended-operations', 'harvests',
  'livestock', 'findings', 'members', 'recipes',
]

export function useSampleFarmStatus(enabled = true) {
  return useQuery({
    queryKey: sampleFarmKey,
    queryFn: () => api.get<SampleFarmStatus>(SAMPLE_FARM_PATH),
    enabled,
  })
}

// True while a switch or a reset is in flight. Asked of the mutation
// cache, not of one hook instance: the Settings section and the banner can
// be on screen together, and a request fired from either one holds the
// controls of both.
export function useSampleFarmBusy() {
  return useIsMutating({ mutationKey: sampleFarmKey }) > 0
}

// The server just seeded, reseeded or deleted the sample farm. Nothing of
// the previous seed may linger: every enable and every reset hands back a
// farm with a NEW id, and the old one's fields and herds would stay behind
// as orphans.
async function syncAfterChange(
  queryClient: QueryClient,
  status: SampleFarmStatus,
  enter: boolean
) {
  const { farms, activeFarm } = useFarmStore.getState()
  const previous = farms.filter(f => f.isSample)
  const wasInside = !!activeFarm?.isSample

  // Stores and cache first, refetch after. Removing the farm also clears
  // the active farm when it was this one; dropping its queries keeps the
  // invalidation below from refetching them against a farm the server no
  // longer has (the screens still hold the old id until they re-render).
  previous.forEach(f => deleteFarmCascade(f.id))
  queryClient.removeQueries({
    predicate: query => query.queryKey.some(part =>
      typeof part === 'string' && previous.some(f => part.includes(f.id))
    ),
  })

  queryClient.setQueryData(sampleFarmKey, status)
  FARM_SCOPED_KEYS.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }))
  // Resolves once useFarms has synced the new list into the store — and
  // picked the favorite/first real farm if the active one was removed.
  await queryClient.invalidateQueries({ queryKey: ['farms'] })

  // Whoever was inside the sample farm goes into the new one: useFarms
  // could not tell (the active farm left with the old seed), and a reset
  // must never end on one of the farmer's own farms without a word.
  const { farms: synced, activeFarm: current, favoriteFarmId, setActiveFarm } =
    useFarmStore.getState()
  const sample = synced.find(f => f.id === status.farmId)
  if (sample && (enter || wasInside)) {
    setActiveFarm(sample)
  } else if (!current && synced.length > 0) {
    // The list did not come back (connection) — the farms still in the
    // store are the farmer's own; never stay without an active one.
    setActiveFarm(synced.find(f => f.id === favoriteFarmId) ?? synced[0])
  }
}

// ── Switch on / off ───────────────────────────────────────────────────
// On seeds a fresh sample farm and takes the farmer into it; off deletes
// it completely. It can always be switched on again.
export function useToggleSampleFarm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: sampleFarmKey,
    mutationFn: (enabled: boolean) =>
      api.put<SampleFarmStatus>(SAMPLE_FARM_PATH, { enabled }),
    // Returned, so the mutation stays pending until the app is in sync.
    onSuccess: (status) => syncAfterChange(queryClient, status, status.enabled),
  })
}

// ── Reset now ─────────────────────────────────────────────────────────
// Back to the default data without waiting for the expiry. Whoever was
// inside the sample farm stays inside the new one. 409 when it is off.
export function useResetSampleFarm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: sampleFarmKey,
    mutationFn: () => api.post<SampleFarmStatus>(`${SAMPLE_FARM_PATH}/reset`),
    onSuccess: (status) => syncAfterChange(queryClient, status, false),
  })
}
