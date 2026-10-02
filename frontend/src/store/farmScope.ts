import { useMemo } from 'react'
import { useFarmStore } from './useFarmStore'
import type { Farm } from './useFarmStore'
import { useFieldStore } from './useFieldStore'
import { useLivestockStore } from './useLivestockStore'

// ──────────────────────────────────────────────────────────────────────────
// Which farms an "all farms" view covers. The sample farm is a sandbox: it
// never mixes into the farmer's own numbers, and while it is the farm
// being explored the app shows it alone. Every screen that adds things up
// across farms reads through here. Views of ONE farm (anything keyed on
// the active farm or on a field's own farmId) don't need it, and the farm
// drawer and the map pins keep listing every farm — they are how the
// farmer gets into the sample farm and back out.
// ──────────────────────────────────────────────────────────────────────────

export function farmsInScope(farms: Farm[], activeFarm: Farm | null): Farm[] {
  if (activeFarm?.isSample) return farms.filter(f => f.id === activeFarm.id)
  return farms.filter(f => !f.isSample)
}

// Whatever hangs off a farm by farmId, narrowed to those farms. Fields and
// herds live in flat stores that hold whatever farm was loaded — the
// sample farm's included — so an all-farms view never takes them whole.
export function recordsInScope<T extends { farmId: string }>(
  records: T[],
  farms: Farm[]
): T[] {
  const farmIds = new Set(farms.map(f => f.id))
  return records.filter(r => farmIds.has(r.farmId))
}

export function useFarmsInScope() {
  const farms = useFarmStore(s => s.farms)
  const activeFarm = useFarmStore(s => s.activeFarm)
  return useMemo(() => farmsInScope(farms, activeFarm), [farms, activeFarm])
}

function useInScope<T extends { farmId: string }>(records: T[]): T[] {
  const farms = useFarmsInScope()
  return useMemo(() => recordsInScope(records, farms), [records, farms])
}

export function useFieldsInScope() {
  return useInScope(useFieldStore(s => s.fields))
}

export function useLivestockInScope() {
  return useInScope(useLivestockStore(s => s.units))
}
