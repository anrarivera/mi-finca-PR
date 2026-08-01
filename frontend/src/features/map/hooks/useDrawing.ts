import { useState, useCallback, useEffect, useMemo } from 'react'
import * as L from 'leaflet'

export type DrawingMode = 'idle' | 'drawing' | 'complete' | 'editing'

export type DrawingState = {
  mode: DrawingMode
  points: L.LatLng[]
  areaAcres: number | null
  selectedPointIndex: number | null
}

function calculateGeodesicArea(latlngs: L.LatLng[]): number {
  const R = 6378137
  let area = 0
  const len = latlngs.length
  for (let i = 0; i < len; i++) {
    const p1 = latlngs[i]
    const p2 = latlngs[(i + 1) % len]
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180
    const lat1 = (p1.lat * Math.PI) / 180
    const lat2 = (p2.lat * Math.PI) / 180
    area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2))
  }
  return Math.abs((area * R * R) / 2)
}

function calculateAcres(latlngs: L.LatLng[]): number {
  if (latlngs.length < 3) return 0
  const sqMeters = calculateGeodesicArea(latlngs)
  return sqMeters * 0.000247105
}

// Find which edge of the polygon is closest to a given point
// Returns the index to insert AFTER (so insert after index i means
// the new point goes between points[i] and points[i+1])
export function findNearestEdgeIndex(
  clickedLatLng: L.LatLng,
  points: L.LatLng[],
  map: L.Map
): number {
  let nearestIndex = 0
  let nearestDistance = Infinity

  for (let i = 0; i < points.length; i++) {
    const a = map.latLngToLayerPoint(points[i])
    const b = map.latLngToLayerPoint(points[(i + 1) % points.length])
    const p = map.latLngToLayerPoint(clickedLatLng)

    // Distance from point p to line segment a-b
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy

    let t = 0
    if (lenSq !== 0) {
      t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
      t = Math.max(0, Math.min(1, t))
    }

    const closestX = a.x + t * dx
    const closestY = a.y + t * dy
    const dist = Math.sqrt((p.x - closestX) ** 2 + (p.y - closestY) ** 2)

    if (dist < nearestDistance) {
      nearestDistance = dist
      nearestIndex = i
    }
  }

  return nearestIndex
}

export function useDrawing() {
  const [mode, setMode] = useState<DrawingMode>('idle')
  const [points, setPoints] = useState<L.LatLng[]>([])
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)

  // Derived, not stored: the area is a pure function of the polygon, shown
  // once a shape exists (complete/editing) and cleared with the points.
  const areaAcres = useMemo(
    () =>
      (mode === 'complete' || mode === 'editing') && points.length >= 3
        ? parseFloat(calculateAcres(points).toFixed(2))
        : null,
    [mode, points]
  )

  // Remove the last placed point while drawing (Backspace / panel button)
  const undoLastPoint = useCallback(() => {
    setPoints(prev => (prev.length === 0 ? prev : prev.slice(0, -1)))
  }, [])

  // Delete the selected point while editing (Delete / panel button)
  const deleteSelectedPoint = useCallback(() => {
    if (selectedPointIndex === null) return
    setPoints(prev => {
      // Need at least 3 points to remain a valid polygon
      if (prev.length <= 3) return prev
      return prev.filter((_, i) => i !== selectedPointIndex)
    })
    setSelectedPointIndex(null)
  }, [selectedPointIndex])

  // ── Keyboard shortcuts — same actions the panel buttons expose ─────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (mode === 'drawing' && e.key === 'Backspace') {
        undoLastPoint()
        return
      }

      if (mode === 'editing') {
        if (e.key === 'Escape') {
          // Deselect without deleting
          setSelectedPointIndex(null)
          return
        }

        if (e.key === 'Delete') {
          deleteSelectedPoint()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, undoLastPoint, deleteSelectedPoint])

  const loadBoundary = useCallback((points: L.LatLng[]) => {
    setPoints(points)
    setMode('complete')
    setSelectedPointIndex(null)
  }, [])

  const startDrawing = useCallback(() => {
    setMode('drawing')
    setPoints([])
    setSelectedPointIndex(null)
  }, [])

  const addPoint = useCallback((latlng: L.LatLng) => {
    setPoints(prev => [...prev, latlng])
  }, [])

  const completeDrawing = useCallback((currentPoints: L.LatLng[]) => {
    if (currentPoints.length < 3) return
    setMode('complete')
    setSelectedPointIndex(null)
  }, [])

  const startEditing = useCallback(() => {
    setMode('editing')
    setSelectedPointIndex(null)
  }, [])

  const finishEditing = useCallback(() => {
    setMode('complete')
    setSelectedPointIndex(null)
  }, [])

  const clearDrawing = useCallback(() => {
    setMode('idle')
    setPoints([])
    setSelectedPointIndex(null)
  }, [])

  const movePoint = useCallback((index: number, newLatLng: L.LatLng) => {
    setPoints(prev => {
      const updated = [...prev]
      updated[index] = newLatLng
      return updated
    })
  }, [])

  const selectPoint = useCallback((index: number) => {
    setSelectedPointIndex(prev => prev === index ? null : index)
  }, [])

  const deselectPoint = useCallback(() => {
    setSelectedPointIndex(null)
  }, [])

  const insertPointAfter = useCallback((afterIndex: number, latlng: L.LatLng) => {
    setPoints(prev => {
      const newPoints = [...prev]
      newPoints.splice(afterIndex + 1, 0, latlng)
      return newPoints
    })
  }, [])

  const moveAllPoints = useCallback((deltaLat: number, deltaLng: number) => {
    setPoints(prev =>
      prev.map(p => L.latLng(p.lat + deltaLat, p.lng + deltaLng))
    )
  }, [])

  return {
    mode,
    points,
    areaAcres,
    selectedPointIndex,
    startDrawing,
    addPoint,
    completeDrawing,
    startEditing,
    finishEditing,
    clearDrawing,
    movePoint,
    selectPoint,
    deselectPoint,
    insertPointAfter,
    moveAllPoints,
    loadBoundary,
    undoLastPoint,
    deleteSelectedPoint,
  }
}