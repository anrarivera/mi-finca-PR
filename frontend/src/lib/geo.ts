// Shared geographic helpers, independent of Leaflet so they can be used in
// stores, the dashboard, and tests.

export type GeoPoint = { lat: number; lng: number }

const EARTH_RADIUS_M = 6378137
const SQ_METERS_PER_ACRE = 1 / 0.000247105

// Geodesic shoelace formula (same approach Leaflet.GeometryUtil uses).
export function geodesicAreaSqMeters(points: GeoPoint[]): number {
  if (points.length < 3) return 0
  let area = 0
  const len = points.length
  for (let i = 0; i < len; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % len]
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180
    const lat1 = (p1.lat * Math.PI) / 180
    const lat2 = (p2.lat * Math.PI) / 180
    area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2))
  }
  return Math.abs((area * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
}

export function geodesicAreaAcres(points: GeoPoint[]): number {
  return geodesicAreaSqMeters(points) / SQ_METERS_PER_ACRE
}
