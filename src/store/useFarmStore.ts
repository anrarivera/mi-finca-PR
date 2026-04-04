import { create } from 'zustand'

type Farm = {
  id: string
  name: string
  location: string
  totalFields: number
  totalCrops: number
  totalAreaAcres: number
  createdAt: string
}

type FarmStore = {
  activeFarmId: string | null
  activeFarm: Farm | null
  setActiveFarm: (farm: Farm) => void
  clearActiveFarm: () => void
}

export const useFarmStore = create<FarmStore>((set) => ({
  activeFarmId: null,
  activeFarm: null,
  setActiveFarm: (farm) => set({ activeFarmId: farm.id, activeFarm: farm }),
  clearActiveFarm: () => set({ activeFarmId: null, activeFarm: null }),
}))