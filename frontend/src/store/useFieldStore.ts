import { create } from 'zustand'
// ─── Added by Claude — localStorage persistence (no backend/auth needed) ───
import { persist } from 'zustand/middleware'
import type { PlacedField } from '@/features/field/types'

type FieldStore = {
  fields: PlacedField[]
  addField: (field: PlacedField) => void
  updateField: (id: string, updates: Partial<PlacedField>) => void
  removeField: (id: string) => void
  removeFieldsByFarmId: (farmId: string) => void
  getField: (id: string) => PlacedField | undefined
  getFieldsByFarmId: (farmId: string) => PlacedField[]
}

// ──────────────────────────────────────────────────────────────────────────
// Added by Claude — wrapped this store in the `persist` middleware so field
// data survives a page refresh while the app runs frontend-only (no backend
// or auth). State is saved to localStorage under the key below. To wipe all
// persisted data during testing, run `localStorage.clear()` in the browser
// console (or remove just the "mi-finca-fields" key) and refresh.
// ──────────────────────────────────────────────────────────────────────────
export const useFieldStore = create<FieldStore>()(
  persist(
    (set, get) => ({
  fields: [],

  addField: (field) =>
    set(state => ({ fields: [...state.fields, field] })),

  updateField: (id, updates) =>
    set(state => ({
      fields: state.fields.map(f => f.id === id ? { ...f, ...updates } : f)
    })),

  removeField: (id) =>
    set(state => ({ fields: state.fields.filter(f => f.id !== id) })),

  removeFieldsByFarmId: (farmId) =>
    set(state => ({ fields: state.fields.filter(f => f.farmId !== farmId) })),

  getField: (id) => {
    const f = get().fields.find(f => f.id === id)
    if (!f) return undefined
    return { ...f, rows: f.rows ?? [], freePlants: f.freePlants ?? [] }
  },

  getFieldsByFarmId: (farmId) =>
    get().fields.filter(f => f.farmId === farmId),
    }),
    // ─── Added by Claude — persist config ───
    // Only the `fields` data is written to localStorage; the action functions
    // above are recreated on load, so they are intentionally excluded here.
    {
      name: 'mi-finca-fields',
      partialize: (state) => ({
        fields: state.fields,
      }),
    }
  )
)