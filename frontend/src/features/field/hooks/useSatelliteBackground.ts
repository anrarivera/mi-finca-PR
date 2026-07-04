import { useMemo } from 'react'
import { farmBoundaryToBBox } from '../utils/canvasGeo'
import type { BBox } from '../utils/canvasGeo'

type Result = {
  bbox: BBox | null
}

export function useSatelliteBackground(
  farmBoundary: Array<{ lat: number; lng: number }>
): Result {
  // The boundary array is often rebuilt by callers with identical contents,
  // so memoize on its serialized value rather than the array identity.
  const boundaryKey = JSON.stringify(farmBoundary)

  const bbox = useMemo(() => {
    if (farmBoundary.length < 3) return null
    return farmBoundaryToBBox(farmBoundary)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryKey])

  return { bbox }
}
