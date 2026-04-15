import { create } from 'zustand'
import type { PlacedField } from '@/features/field/types'

export type Farm = {
  id: string
  name: string
  location: string
  totalAreaAcres: number
  createdAt: string
  boundary: Array<{ lat: number; lng: number }>
  fieldIds: string[]
}

type FarmStore = {
  farms: Farm[]
  activeFarmId: string | null
  activeFarm: Farm | null
  favoriteFarmId: string | null
  addFarm: (farm: Farm) => void
  updateFarm: (id: string, updates: Partial<Farm>) => void
  deleteFarm: (id: string) => void
  setActiveFarm: (farm: Farm) => void
  clearActiveFarm: () => void
  setFavoriteFarm: (id: string) => void
  addFieldIdToFarm: (farmId: string, fieldId: string) => void
  removeFieldIdFromFarm: (farmId: string, fieldId: string) => void
}

export const useFarmStore = create<FarmStore>((set, get) => ({
  farms: [],
  activeFarmId: null,
  activeFarm: null,
  favoriteFarmId: null,

  addFarm: (farm) =>
    set(state => ({
      farms: [...state.farms, farm],
      // Auto-set as favorite if it's the first farm
      favoriteFarmId: state.farms.length === 0 ? farm.id : state.favoriteFarmId,
    })),

  updateFarm: (id, updates) =>
    set(state => ({
      farms: state.farms.map(f => f.id === id ? { ...f, ...updates } : f),
      activeFarm: state.activeFarmId === id
        ? { ...state.activeFarm!, ...updates }
        : state.activeFarm,
    })),

  deleteFarm: (id) =>
    set(state => ({
      farms: state.farms.filter(f => f.id !== id),
      activeFarmId: state.activeFarmId === id ? null : state.activeFarmId,
      activeFarm: state.activeFarmId === id ? null : state.activeFarm,
      favoriteFarmId: state.favoriteFarmId === id
        ? (state.farms.find(f => f.id !== id)?.id ?? null)
        : state.favoriteFarmId,
    })),

  setActiveFarm: (farm) =>
    set({ activeFarmId: farm.id, activeFarm: farm }),

  clearActiveFarm: () =>
    set({ activeFarmId: null, activeFarm: null }),

  setFavoriteFarm: (id) =>
    set({ favoriteFarmId: id }),

  addFieldIdToFarm: (farmId, fieldId) =>
    set(state => ({
      farms: state.farms.map(f =>
        f.id === farmId
          ? { ...f, fieldIds: [...f.fieldIds, fieldId] }
          : f
      ),
      activeFarm: state.activeFarmId === farmId
        ? { ...state.activeFarm!, fieldIds: [...state.activeFarm!.fieldIds, fieldId] }
        : state.activeFarm,
    })),

  removeFieldIdFromFarm: (farmId, fieldId) =>
    set(state => ({
      farms: state.farms.map(f =>
        f.id === farmId
          ? { ...f, fieldIds: f.fieldIds.filter(id => id !== fieldId) }
          : f
      ),
      activeFarm: state.activeFarmId === farmId
        ? { ...state.activeFarm!, fieldIds: state.activeFarm!.fieldIds.filter(id => id !== fieldId) }
        : state.activeFarm,
    })),
}))