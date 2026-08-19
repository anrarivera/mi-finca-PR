import type { RecommendedOperationType } from './data/cropSchedules'

// Re-exported: consumers of RecommendedOperation naturally want its type
// union from the same module (plantingEventManager does).
export type { RecommendedOperationType }

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
  path?: LatLngPoint[]
  pathClosed?: boolean
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
  // The wire carries explicit nulls for open operations (see the field
  // API contract in backend/src/contracts/fieldContract.ts — the contract
  // test asserts these types stay assignable).
  completedDate?: string | null
  // Set by the backend when a check-off creates an operations-log entry
  // (SDD §6.2). Round-tripped on field saves so the link survives edits.
  completedOperationId?: string | null
  notes?: string | null
  product?: string | null
  quantity?: number | null
  unit?: string | null
}

export type PlantingEvent = {
  id: string
  fieldId: string
  cropTypeId: string
  plantingDate: string
  plantCount: number
  // Which recipe version this planting followed (Recetas de Cultivo R3).
  // The stamped operations are a copy; this reference is for proof.
  // Round-tripped on field saves like completedOperationId.
  recipeVersionId?: string | null
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
  /** 'crops' (rows/plants) or 'livestock' (a corral — herds assigned). */
  kind?: 'crops' | 'livestock'
  color: string
  shape: FieldShape
  // Boundary stored as lat/lng — the source of truth
  boundary: LatLngPoint[]
  // Placement center — where the user double-clicked on the farm map
  farmLat: number
  farmLng: number
  displayMode: 'pin' | 'shape'
  // True while the field is being placed on the map (backend column).
  isPositioning?: boolean
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