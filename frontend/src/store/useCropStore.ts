import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CropType } from '@/features/field/data/cropLibrary'
import type { CropSchedule } from '@/features/field/data/cropSchedules'
import type { ApiCrop } from '@/features/field/hooks/useCropsApi'

export type CustomCrop = {
  crop: CropType
  schedule: CropSchedule | null
}

type CropState = {
  // All crops from API (built-ins + user's custom crops)
  crops: ApiCrop[]
  // Legacy custom crops (local only, pre-API)
  customCrops: CustomCrop[]

  setCrops: (crops: ApiCrop[]) => void
  addCustomCrop: (entry: CustomCrop) => void
  updateCustomCrop: (cropId: string, entry: CustomCrop) => void
  removeCustomCrop: (cropId: string) => void

  // Lookup helpers
  getCropById: (id: string) => ApiCrop | undefined
  getCropsByCategory: () => Record<string, ApiCrop[]>
}

export const useCropStore = create<CropState>()(
  persist(
    (set, get) => ({
      crops: [],
      customCrops: [],

      setCrops: (crops) => set({ crops }),

      addCustomCrop: (entry) =>
        set(s => ({ customCrops: [...s.customCrops, entry] })),

      updateCustomCrop: (cropId, entry) =>
        set(s => ({
          customCrops: s.customCrops.map(c => c.crop.id === cropId ? entry : c),
        })),

      removeCustomCrop: (cropId) =>
        set(s => ({
          customCrops: s.customCrops.filter(c => c.crop.id !== cropId),
        })),

      getCropById: (id) => get().crops.find(c => c.id === id),

      getCropsByCategory: () =>
        get().crops.reduce((acc, crop) => {
          if (!acc[crop.category]) acc[crop.category] = []
          acc[crop.category].push(crop)
          return acc
        }, {} as Record<string, ApiCrop[]>),
    }),
    {
      name: 'mi-finca-crops',
      // Only persist custom crops — API crops are always refetched
      partialize: (s) => ({ customCrops: s.customCrops }),
    }
  )
)