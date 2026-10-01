import { useFarms } from '@/features/farm/hooks/useFarmsApi'
import { useFields } from '@/features/field/hooks/useFieldsApi'
import { useCrops } from '@/features/field/hooks/useCropsApi'
import { useResolvedRecipes } from '@/features/field/hooks/useRecipesApi'
import { useLivestock } from '@/features/livestock/hooks/useLivestockApi'
import { useFarmStore } from '@/store/useFarmStore'

export default function DataProvider({ children }: { children: React.ReactNode }) {
  const activeFarmId = useFarmStore(s => s.activeFarmId)

  useFarms()
  useFields(activeFarmId)
  useCrops()
  // The active farm's governing recipes (R2 ladder) — what plantings
  // stamp their calendars from.
  useResolvedRecipes()
  // Hydrates useLivestockStore from the API once farms are loaded.
  useLivestock()

  return <>{children}</>
}