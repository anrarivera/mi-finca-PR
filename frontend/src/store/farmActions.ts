import type { QueryClient } from '@tanstack/react-query'
import { useFarmStore } from './useFarmStore'
import { useFieldStore } from './useFieldStore'
import { useLivestockStore } from './useLivestockStore'
import { useCropStore } from './useCropStore'
import { useRecipeStore } from './useRecipeStore'
import { useHarvestHighlightStore } from './useHarvestHighlightStore'
import { useUnsavedWorkStore } from './useUnsavedWorkStore'
import { useSettingsStore } from './useSettingsStore'

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
// the old active farm instead of the new account's. Livestock and crops
// are also persisted to localStorage, so their copies there are dropped
// too.
// Every store in this folder is either wiped here or left out on purpose:
//  - useSettingsStore keeps notificationPrefs. The server holds a copy per
//    account, but nothing reads it back: wiping the local one would reset
//    the bell, and Ajustes would show switches the server does not have.
//  - useToastStore is the screen's, not the account's.
//  - useAuthStore is the session itself (setAuth / clearAuth).
// What localStorage holds outside the stores stays as well: the language
// and the collapsed sections are the device's, and demoTourSeen:<userId>
// names its account in the key.
export function clearAccountData() {
  useFarmStore.getState().clearFarms()
  useFieldStore.setState({ fields: [] })
  useLivestockStore.getState().setUnits([])
  useLivestockStore.persist.clearStorage()
  useCropStore.setState({ crops: [], customCrops: [] })
  useCropStore.persist.clearStorage()
  // The revision moves forward, never back to 0: whatever is cached by
  // revision (the op-label map in i18n) has to see a number it has not
  // seen before.
  useRecipeStore.setState(s => ({ byFarm: {}, revision: s.revision + 1 }))
  useHarvestHighlightStore.setState({ highlight: null, toggles: null })
  useUnsavedWorkStore.setState({ count: 0 })
  useSettingsStore.setState({ seenNotificationIds: [] })
}

// The clean slate: the stores above, plus everything React Query fetched
// on the account's behalf. The ['auth', …] queries stay — the signup
// config and the session probe belong to no account, and the auth pages
// are reading them while this runs.
export function wipeAccount(queryClient: QueryClient) {
  clearAccountData()
  queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'auth' })
}
