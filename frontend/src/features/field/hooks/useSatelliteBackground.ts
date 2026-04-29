import { useMemo } from 'react'
import { farmBoundaryToBBox } from '../utils/canvasGeo'
import type { BBox } from '../utils/canvasGeo'

type Result = {
  bbox: BBox | null
}

export function useSatelliteBackground(
  farmBoundary: Array<{ lat: number; lng: number }>
): Result {
  const bbox = useMemo(() => {
    if (farmBoundary.length < 3) return null
    return farmBoundaryToBBox(farmBoundary)
  }, [JSON.stringify(farmBoundary)])

  return { bbox }
}