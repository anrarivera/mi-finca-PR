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

// Logout must wipe every per-account store — they live in memory across
// the SPA navigation to /login, so without this the next account (e.g. a
// demo login) inherits the previous user's farms and the map flies to
// the old active farm instead of the new account's. Livestock is also
// persisted to localStorage, so its offline cache is dropped too.
export function clearAccountData() {
  useFarmStore.getState().clearFarms()
  useFieldStore.setState({ fields: [] })
  useLivestockStore.getState().setUnits([])
  useLivestockStore.persist.clearStorage()
}
