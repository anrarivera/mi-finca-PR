import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LivestockUnit } from '@/features/livestock/types'

// Livestock units follow the same offline-first pattern as farms/fields:
// a flat list with a farmId foreign key, persisted to localStorage.

type LivestockStore = {
  units: LivestockUnit[]
  addUnit: (unit: LivestockUnit) => void
  updateUnit: (id: string, updates: Partial<LivestockUnit>) => void
  removeUnit: (id: string) => void
  removeUnitsByFarmId: (farmId: string) => void
  getUnitsByFarmId: (farmId: string) => LivestockUnit[]
}

export const useLivestockStore = create<LivestockStore>()(
  persist(
    (set, get) => ({
      units: [],

      addUnit: (unit) =>
        set(state => ({ units: [...state.units, unit] })),

      updateUnit: (id, updates) =>
        set(state => ({
          units: state.units.map(u => u.id === id ? { ...u, ...updates } : u),
        })),

      removeUnit: (id) =>
        set(state => ({ units: state.units.filter(u => u.id !== id) })),

      removeUnitsByFarmId: (farmId) =>
        set(state => ({ units: state.units.filter(u => u.farmId !== farmId) })),

      getUnitsByFarmId: (farmId) =>
        get().units.filter(u => u.farmId === farmId),
    }),
    {
      name: 'mi-finca-livestock',
      partialize: (state) => ({ units: state.units }),
    }
  )
)
