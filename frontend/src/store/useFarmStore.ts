import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  favoriteFarmId: string | null
  createFarm: (data: { name: string; location: string }) => Farm
  addFarm: (farm: Farm) => void
  updateFarm: (id: string, updates: Partial<Farm>) => void
  deleteFarm: (id: string) => void
  setActiveFarm: (farm: Farm) => void
  clearActiveFarm: () => void
  setFavoriteFarm: (id: string) => void
  addFieldIdToFarm: (farmId: string, fieldId: string) => void
  removeFieldIdFromFarm: (farmId: string, fieldId: string) => void
}

// ──────────────────────────────────────────────────────────────────────────
// Farm data persists to localStorage (key "mi-finca-farms") so the app works
// fully offline / logged-out. The active farm is stored as an id only —
// `useActiveFarm()` derives the object from `farms`, so there is no duplicated
// copy that can drift out of sync when a farm is updated.
// ──────────────────────────────────────────────────────────────────────────
export const useFarmStore = create<FarmStore>()(
  persist(
    (set, get) => ({
      farms: [],
      activeFarmId: null,
      favoriteFarmId: null,

      // Single place where new farms are constructed — both the empty state
      // and the map toolbar create farms through here.
      createFarm: (data) => {
        const farm: Farm = {
          id: `farm_${Date.now()}`,
          name: data.name,
          location: data.location,
          totalAreaAcres: 0,
          createdAt: new Date().toISOString(),
          boundary: [],
          fieldIds: [],
        }
        get().addFarm(farm)
        set({ activeFarmId: farm.id })
        return farm
      },

      addFarm: (farm) =>
        set(state => ({
          farms: [...state.farms, farm],
          // Auto-set as favorite if it's the first farm
          favoriteFarmId: state.farms.length === 0 ? farm.id : state.favoriteFarmId,
        })),

      updateFarm: (id, updates) =>
        set(state => ({
          farms: state.farms.map(f => f.id === id ? { ...f, ...updates } : f),
        })),

      deleteFarm: (id) =>
        set(state => ({
          farms: state.farms.filter(f => f.id !== id),
          activeFarmId: state.activeFarmId === id ? null : state.activeFarmId,
          favoriteFarmId: state.favoriteFarmId === id
            ? (state.farms.find(f => f.id !== id)?.id ?? null)
            : state.favoriteFarmId,
        })),

      setActiveFarm: (farm) =>
        set({ activeFarmId: farm.id }),

      clearActiveFarm: () =>
        set({ activeFarmId: null }),

      setFavoriteFarm: (id) =>
        set({ favoriteFarmId: id }),

      addFieldIdToFarm: (farmId, fieldId) =>
        set(state => ({
          farms: state.farms.map(f =>
            f.id === farmId
              ? { ...f, fieldIds: [...f.fieldIds, fieldId] }
              : f
          ),
        })),

      removeFieldIdFromFarm: (farmId, fieldId) =>
        set(state => ({
          farms: state.farms.map(f =>
            f.id === farmId
              ? { ...f, fieldIds: f.fieldIds.filter(id => id !== fieldId) }
              : f
          ),
        })),
    }),
    // Only the data fields are written to localStorage; the action functions
    // above are recreated on load, so they are intentionally excluded here.
    {
      name: 'mi-finca-farms',
      partialize: (state) => ({
        farms: state.farms,
        activeFarmId: state.activeFarmId,
        favoriteFarmId: state.favoriteFarmId,
      }),
    }
  )
)

// Derived selector — the single source of truth for "which farm is active".
export const useActiveFarm = (): Farm | null =>
  useFarmStore(s =>
    s.activeFarmId ? (s.farms.find(f => f.id === s.activeFarmId) ?? null) : null
  )
