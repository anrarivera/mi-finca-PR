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
  addFarm: (farm: Farm) => void
  updateFarm: (id: string, updates: Partial<Farm>) => void
  deleteFarm: (id: string) => void
  setActiveFarm: (farm: Farm) => void
  clearActiveFarm: () => void
  addFieldIdToFarm: (farmId: string, fieldId: string) => void
  removeFieldIdFromFarm: (farmId: string, fieldId: string) => void
}

export const useFarmStore = create<FarmStore>((set, get) => ({
  farms: [],
  activeFarmId: null,
  activeFarm: null,

  addFarm: (farm) =>
    set(state => ({ farms: [...state.farms, farm] })),

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
    })),

  setActiveFarm: (farm) =>
    set({ activeFarmId: farm.id, activeFarm: farm }),

  clearActiveFarm: () =>
    set({ activeFarmId: null, activeFarm: null }),

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