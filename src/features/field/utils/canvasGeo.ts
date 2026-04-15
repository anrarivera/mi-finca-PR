import type { LatLngPoint, CanvasPoint } from '../types'

export const CANVAS_W = 800
export const CANVAS_H = 600

export type BBox = {
  west: number
  south: number
  east: number
  north: number
}

// Geographic constants for Puerto Rico's latitude
const FT_PER_LAT = 364000
const FT_PER_LNG = 298000

// ── BBox from farm boundary ───────────────────────────────────────────

export function farmBoundaryToBBox(
  boundary: Array<{ lat: number; lng: number }>,
  paddingFactor = 0.15
): BBox {
  if (boundary.length === 0) {
    return { west: -66.592, south: 18.218, east: -66.588, north: 18.222 }
  }

  const lats = boundary.map(p => p.lat)
  const lngs = boundary.map(p => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latRange = Math.max(maxLat - minLat, 0.0005)
  const lngRange = Math.max(maxLng - minLng, 0.0005)

  // Pad equally on all sides
  const latPad = latRange * paddingFactor
  const lngPad = lngRange * paddingFactor

  const padded = {
    south: minLat - latPad,
    north: maxLat + latPad,
    west: minLng - lngPad,
    east: maxLng + lngPad,
  }

  // Adjust to match canvas 4:3 aspect ratio so no distortion
  return adjustBboxToAspectRatio(padded, CANVAS_W / CANVAS_H)
}

function adjustBboxToAspectRatio(bbox: BBox, targetRatio: number): BBox {
  const lngRange = bbox.east - bbox.west
  const latRange = bbox.north - bbox.south

  // Normalize lng to lat-equivalent degrees at PR latitude
  const lngNorm = lngRange * (FT_PER_LNG / FT_PER_LAT)
  const currentRatio = lngNorm / latRange

  if (currentRatio > targetRatio) {
    // Too wide — expand latitude
    const targetLatRange = lngNorm / targetRatio
    const pad = (targetLatRange - latRange) / 2
    return { ...bbox, south: bbox.south - pad, north: bbox.north + pad }
  } else {
    // Too tall — expand longitude
    const targetLngNorm = latRange * targetRatio
    const targetLngRange = targetLngNorm * (FT_PER_LAT / FT_PER_LNG)
    const pad = (targetLngRange - lngRange) / 2
    return { ...bbox, west: bbox.west - pad, east: bbox.east + pad }
  }
}

// ── Coordinate conversion ─────────────────────────────────────────────

export function latlngToCanvas(lat: number, lng: number, bbox: BBox): CanvasPoint {
  return {
    x: ((lng - bbox.west) / (bbox.east - bbox.west)) * CANVAS_W,
    y: ((bbox.north - lat) / (bbox.north - bbox.south)) * CANVAS_H,
  }
}

export function canvasToLatlng(x: number, y: number, bbox: BBox): LatLngPoint {
  return {
    lng: bbox.west + (x / CANVAS_W) * (bbox.east - bbox.west),
    lat: bbox.north - (y / CANVAS_H) * (bbox.north - bbox.south),
  }
}

// ── Scale: how many feet per canvas pixel ────────────────────────────

export type CanvasScale = {
  ftPerPixelX: number
  ftPerPixelY: number
  ftPerPixel: number  // average — use for diagonal measurements
}

export function getCanvasScale(bbox: BBox): CanvasScale {
  const totalWidthFt = (bbox.east - bbox.west) * FT_PER_LNG
  const totalHeightFt = (bbox.north - bbox.south) * FT_PER_LAT
  const ftPerPixelX = totalWidthFt / CANVAS_W
  const ftPerPixelY = totalHeightFt / CANVAS_H
  return {
    ftPerPixelX,
    ftPerPixelY,
    ftPerPixel: (ftPerPixelX + ftPerPixelY) / 2,
  }
}

// ── Measurement utilities ─────────────────────────────────────────────

// Distance between two canvas points in real-world feet
export function canvasDistanceFt(
  a: CanvasPoint,
  b: CanvasPoint,
  scale: CanvasScale
): number {
  const dx = (b.x - a.x) * scale.ftPerPixelX
  const dy = (b.y - a.y) * scale.ftPerPixelY
  return Math.sqrt(dx * dx + dy * dy)
}

// Total perimeter of a polygon in feet
export function perimeterFt(points: CanvasPoint[], scale: CanvasScale): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length
    total += canvasDistanceFt(points[i], points[next], scale)
  }
  return total
}

// Area of a polygon in square feet using Shoelace formula
export function areaFt2(points: CanvasPoint[], scale: CanvasScale): number {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * scale.ftPerPixelX * points[j].y * scale.ftPerPixelY
    area -= points[j].x * scale.ftPerPixelX * points[i].y * scale.ftPerPixelY
  }
  return Math.abs(area) / 2
}

export function ft2ToAcres(ft2: number): number {
  return ft2 / 43560
}

// Format a distance for display
export function formatFt(ft: number): string {
  if (ft >= 5280) return `${(ft / 5280).toFixed(2)} mi`
  if (ft < 1) return `<1 ft`
  return `${Math.round(ft)} ft`
}

// Midpoint of two canvas points
export function midpoint(a: CanvasPoint, b: CanvasPoint): CanvasPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// ── Row plant positions ───────────────────────────────────────────────

export function calculateRowPlantPositions(
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  spacingFt: number
): Array<{ lat: number; lng: number }> {
  const dLat = endLat - startLat
  const dLng = endLng - startLng
  const lengthFt = Math.sqrt(
    (dLat * FT_PER_LAT) ** 2 + (dLng * FT_PER_LNG) ** 2
  )
  if (lengthFt <= 0 || spacingFt <= 0) return []
  const count = Math.max(2, Math.floor(lengthFt / spacingFt) + 1)
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1)
    return { lat: startLat + t * dLat, lng: startLng + t * dLng }
  })
}

export function distanceFt(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLat = (lat2 - lat1) * FT_PER_LAT
  const dLng = (lng2 - lng1) * FT_PER_LNG
  return Math.sqrt(dLat * dLat + dLng * dLng)
}