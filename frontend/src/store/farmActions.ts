import { useFarmStore } from './useFarmStore'
import { useFieldStore } from './useFieldStore'
import { useLivestockStore } from './useLivestockStore'

// Deleting a farm must cascade to everything that references it. This is
// the single place that knows the full set of related stores — components
// call this instead of re-assembling the cascade themselves.
export function deleteFarmCascade(farmId: string) {
  useFieldStore.getState().removeFieldsByFarmId(farmId)
  useLivestockStore.getState().removeUnitsByFarmId(farmId)
  useFarmStore.getState().deleteFarm(farmId)
}
