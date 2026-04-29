import type { FieldRow, PlantInstance } from '../types'

const CANVAS_W = 800
const CANVAS_H = 600

type RowInput = {
  id: string
  startX: number  // normalized 0-1
  startY: number
  endX: number
  endY: number
  spacingFt: number
  widthFt: number   // real world field dimensions
  heightFt: number
  primaryCropTypeId: string
  companionCropTypeId: string | null
}

export function calculateRowPlants(input: RowInput): PlantInstance[] {
  const {
    id, startX, startY, endX, endY,
    spacingFt, widthFt, heightFt,
    primaryCropTypeId, companionCropTypeId,
  } = input

  // Convert normalized coordinates to pixels
  const startPxX = startX * CANVAS_W
  const startPxY = startY * CANVAS_H
  const endPxX = endX * CANVAS_W
  const endPxY = endY * CANVAS_H

  // Calculate pixel length of the row
  const dxPx = endPxX - startPxX
  const dyPx = endPxY - startPxY
  const lengthPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx)

  // Convert spacing from feet to pixels
  // Use average of x and y scale for diagonal rows
  const pxPerFtX = CANVAS_W / widthFt
  const pxPerFtY = CANVAS_H / heightFt
  const pxPerFt = (pxPerFtX + pxPerFtY) / 2
  const spacingPx = spacingFt * pxPerFt

  if (spacingPx <= 0 || lengthPx <= 0) return []

  // How many plants fit along the row
  const plantCount = Math.max(2, Math.floor(lengthPx / spacingPx) + 1)

  const plants: PlantInstance[] = []

  for (let i = 0; i < plantCount; i++) {
    // t goes from 0 to 1 along the row
    const t = plantCount === 1 ? 0 : i / (plantCount - 1)

    // Pixel position
    const px = startPxX + t * dxPx
    const py = startPxY + t * dyPx

    // Normalize back to 0-1
    const x = px / CANVAS_W
    const y = py / CANVAS_H

    // Alternate between primary and companion
    const isCompanion = companionCropTypeId !== null && i % 2 !== 0
    const cropTypeId = isCompanion ? companionCropTypeId! : primaryCropTypeId

    plants.push({
      id: `${id}_plant_${i}`,
      cropTypeId,
      x,
      y,
    })
  }

  return plants
}

export function computeCropSummary(
  rows: FieldRow[],
  freePlants: PlantInstance[],
  getCrop: (id: string) => { name: string; nameEs: string; emoji: string } | undefined
) {
  const counts: Record<string, number> = {}

  rows.forEach(row =>
    row.plants.forEach(p => {
      counts[p.cropTypeId] = (counts[p.cropTypeId] || 0) + 1
    })
  )
  freePlants.forEach(p => {
    counts[p.cropTypeId] = (counts[p.cropTypeId] || 0) + 1
  })

  return Object.entries(counts).map(([cropTypeId, count]) => {
    const crop = getCrop(cropTypeId)
    return {
      cropTypeId,
      name: crop?.name ?? cropTypeId,
      nameEs: crop?.nameEs ?? cropTypeId,
      emoji: crop?.emoji ?? '🌱',
      count,
    }
  })
}