import { create } from 'zustand'
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

export const useFieldStore = create<FieldStore>((set, get) => ({
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
}))