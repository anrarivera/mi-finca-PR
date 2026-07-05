import type { PlantInstance } from '../types'

// Single place that turns row positions into plants. Every row tool
// (single row, fill, edit-regenerate) alternates primary/companion the
// same way: odd positions get the companion crop when one is set.
export function buildRowPlants(
  rowId: string,
  positions: Array<{ lat: number; lng: number }>,
  primaryCropTypeId: string,
  companionCropTypeId: string | null,
  plantingDate: string,
): PlantInstance[] {
  return positions.map((pos, i) => ({
    id: `${rowId}_plant_${i}`,
    cropTypeId: companionCropTypeId && i % 2 !== 0 ? companionCropTypeId : primaryCropTypeId,
    lat: pos.lat,
    lng: pos.lng,
    plantingDate,
  }))
}
