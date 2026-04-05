import type { CropType } from './data/cropLibrary'

export type FieldShape = 'rectangle' | 'polygon'

export type FieldPoint = {
  x: number
  y: number
}

export type PlantInstance = {
  id: string
  cropTypeId: string
  x: number  // normalized 0-1
  y: number
}

export type FieldRow = {
  id: string
  startX: number  // normalized 0-1
  startY: number
  endX: number
  endY: number
  spacingFt: number
  primaryCropTypeId: string
  companionCropTypeId: string | null
  plants: PlantInstance[]
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
}

export const FIELD_COLORS = [
  '#8fba4e', '#c4852a', '#7a9e5f', '#b5623e',
  '#5a8f6e', '#d4a843', '#8b6b3d', '#6b9e8f',
  '#a67c52', '#7b9e4a',
]

export function randomFieldColor(): string {
  return FIELD_COLORS[Math.floor(Math.random() * FIELD_COLORS.length)]
}