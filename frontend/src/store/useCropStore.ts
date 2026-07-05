import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CropType } from '@/features/field/data/cropLibrary'
import type { CropSchedule } from '@/features/field/data/cropSchedules'

// ──────────────────────────────────────────────────────────────────────────
// Custom crops (issue #1). The built-in library stays as shipped data; any
// crop the farmer defines — with an optional operations "recipe" — lives
// here and persists locally, mirroring how farms/fields persist. When
// authenticated, the backend /api/v1/crops endpoints hold the same shape.
// getCropById / getScheduleForCrop consult this store, so custom crops are
// plantable everywhere built-ins are.
// ──────────────────────────────────────────────────────────────────────────

export type CustomCrop = {
  crop: CropType
  /** Optional recipe: harvest window + operation templates. */
  schedule: CropSchedule | null
}

type CropState = {
  customCrops: CustomCrop[]
  addCustomCrop: (entry: CustomCrop) => void
  updateCustomCrop: (cropId: string, entry: CustomCrop) => void
  removeCustomCrop: (cropId: string) => void
}

export const useCropStore = create<CropState>()(
  persist(
    (set) => ({
      customCrops: [],

      addCustomCrop: (entry) =>
        set(s => ({ customCrops: [...s.customCrops, entry] })),

      updateCustomCrop: (cropId, entry) =>
        set(s => ({
          customCrops: s.customCrops.map(c => c.crop.id === cropId ? entry : c),
        })),

      removeCustomCrop: (cropId) =>
        set(s => ({ customCrops: s.customCrops.filter(c => c.crop.id !== cropId) })),
    }),
    {
      name: 'mi-finca-crops',
      partialize: (s) => ({ customCrops: s.customCrops }),
    }
  )
)
