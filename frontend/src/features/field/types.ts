import type { RecommendedOperationType } from './data/cropSchedules'

export type FieldShape = 'rectangle' | 'polygon'

// All boundary points are now geographic coordinates
export type LatLngPoint = {
  lat: number
  lng: number
}

// Canvas pixel point — used only internally during editing, never stored
export type CanvasPoint = {
  x: number
  y: number
}

export type PlantInstance = {
  id: string
  cropTypeId: string
  lat: number   // geographic — stored permanently
  lng: number
  plantingDate: string
}

export type FieldRow = {
  id: string
  startLat: number   // geographic start point
  startLng: number
  endLat: number     // geographic end point
  endLng: number
  spacingFt: number
  primaryCropTypeId: string
  companionCropTypeId: string | null
  plants: PlantInstance[]
  plantingDate: string
}

export type OperationStatus = 'pending' | 'due' | 'completed' | 'skipped'

export type RecommendedOperation = {
  id: string
  plantingEventId: string
  templateId: string
  type: RecommendedOperationType
  labelEs: string
  recommendedDate: string
  status: OperationStatus
  completedDate?: string
  notes?: string
  product?: string
  quantity?: number
  unit?: string
}

export type PlantingEvent = {
  id: string
  fieldId: string
  cropTypeId: string
  plantingDate: string
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
  // Boundary stored as lat/lng — the source of truth
  boundary: LatLngPoint[]
  // Placement center — where the user double-clicked on the farm map
  farmLat: number
  farmLng: number
  rotation: number
  isPositioning: boolean
  displayMode: 'pin' | 'shape'
  rows: FieldRow[]
  freePlants: PlantInstance[]
  plantingEvents: PlantingEvent[]
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