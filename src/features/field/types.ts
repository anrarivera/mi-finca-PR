import type { RecommendedOperationType } from './data/cropSchedules'

export type FieldShape = 'rectangle' | 'polygon'

export type FieldPoint = { x: number; y: number }

export type PlantInstance = {
  id: string
  cropTypeId: string
  x: number
  y: number
  plantingDate: string   // ISO date string — defaults to today
}

export type FieldRow = {
  id: string
  startX: number
  startY: number
  endX: number
  endY: number
  spacingFt: number
  primaryCropTypeId: string
  companionCropTypeId: string | null
  plants: PlantInstance[]
  plantingDate: string   // ISO date string — defaults to today
}

// ── Operations ────────────────────────────────────────────────────────

export type OperationStatus = 'pending' | 'due' | 'completed' | 'skipped'

export type RecommendedOperation = {
  id: string
  plantingEventId: string
  templateId: string       // references RecommendedOperationTemplate.id
  type: RecommendedOperationType
  labelEs: string
  recommendedDate: string  // ISO date string
  status: OperationStatus
  completedDate?: string
  notes?: string
  product?: string
  quantity?: number
  unit?: string
}

// A planting event groups all plants of the same crop type
// planted on the same date in the same field
export type PlantingEvent = {
  id: string
  fieldId: string
  cropTypeId: string
  plantingDate: string     // ISO date string
  plantCount: number
  rowIds: string[]
  freePlantIds: string[]
  operations: RecommendedOperation[]
}

export type CropSummary = {
  cropTypeId: string
  name: string
  nameEs: string
  emoji: string
  count: number
}

export type PlacedField = {
  id: string
  farmId: string
  name: string
  color: string
  shape: FieldShape
  widthFt: number
  heightFt: number
  points: FieldPoint[]
  farmLat: number
  farmLng: number
  rotation: number
  isPositioning: boolean
  displayMode: 'pin' | 'shape'
  rows: FieldRow[]
  freePlants: PlantInstance[]
  plantingEvents: PlantingEvent[]   // ← new
}

export const FIELD_COLORS = [
  '#8fba4e', '#c4852a', '#7a9e5f', '#b5623e',
  '#5a8f6e', '#d4a843', '#8b6b3d', '#6b9e8f',
  '#a67c52', '#7b9e4a',
]

export function randomFieldColor(): string {
  return FIELD_COLORS[Math.floor(Math.random() * FIELD_COLORS.length)]
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}