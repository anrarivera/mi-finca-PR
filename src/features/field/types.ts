export type FieldShape = 'rectangle' | 'polygon'

export type FieldPoint = {
  x: number  // canvas pixel coordinate
  y: number
}

export type PlacedField = {
  id: string
  name: string
  color: string
  shape: FieldShape
  widthFt: number   // real world dimensions
  heightFt: number  // for rectangle. For polygon this is bounding box height
  points: FieldPoint[]  // normalized 0-1 coordinates relative to field size
  // Farm map placement
  farmLat: number   // where on the farm map it was placed
  farmLng: number
  rotation: number  // degrees 0-360
  isPositioning: boolean  // true while user is still moving/rotating
}

export const FIELD_COLORS = [
  '#8fba4e',  // sage green
  '#c4852a',  // earthy orange
  '#7a9e5f',  // moss
  '#b5623e',  // terracotta
  '#5a8f6e',  // forest
  '#d4a843',  // harvest gold
  '#8b6b3d',  // bark brown
  '#6b9e8f',  // teal sage
  '#a67c52',  // warm clay
  '#7b9e4a',  // olive
]

export function randomFieldColor(): string {
  return FIELD_COLORS[Math.floor(Math.random() * FIELD_COLORS.length)]
}