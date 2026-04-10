import * as L from 'leaflet'

// Ray casting algorithm — returns true if point is inside polygon
export function isPointInPolygon(
  point: L.LatLng,
  polygon: L.LatLng[]
): boolean {
  const { lat: py, lng: px } = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { lat: iy, lng: ix } = polygon[i]
    const { lat: jy, lng: jx } = polygon[j]
    const intersect =
      iy > py !== jy > py &&
      px < ((jx - ix) * (py - iy)) / (jy - iy) + ix
    if (intersect) inside = !inside
  }
  return inside
}

// Convert stored farm boundary points (LatLng objects) to Leaflet LatLngs
export function boundaryToLatLngs(
  boundary: Array<{ lat: number; lng: number }>
): L.LatLng[] {
  return boundary.map(p => L.latLng(p.lat, p.lng))
}