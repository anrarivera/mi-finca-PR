type LatLng = { lat: number; lng: number }

// Geodesic area calculation using the Shoelace formula
// Same algorithm used in the frontend canvasGeo.ts
export function calculateAreaAcres(boundary: LatLng[]): number {
  if (boundary.length < 3) return 0

  const R = 6378137 // Earth radius in meters
  let area = 0
  const len = boundary.length

  for (let i = 0; i < len; i++) {
    const p1 = boundary[i]
    const p2 = boundary[(i + 1) % len]
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180
    const lat1 = (p1.lat * Math.PI) / 180
    const lat2 = (p2.lat * Math.PI) / 180
    area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2))
  }

  const sqMeters = Math.abs((area * R * R) / 2)
  return parseFloat((sqMeters * 0.000247105).toFixed(4))
}

// Format a farm record for API response
// Ensures consistent shape and converts Prisma types
export function formatFarm(farm: any) {
  return {
    id: farm.id,
    name: farm.name,
    location: farm.location,
    farmType: farm.farmType,
    boundary: farm.boundary ?? [],
    totalAreaAcres: parseFloat(farm.totalAreaAcres?.toString() ?? '0'),
    isFavorite: farm.isFavorite,
    description: farm.description ?? null,
    fieldIds: farm.fields?.map((f: any) => f.id) ?? [],
    createdAt: farm.createdAt,
    updatedAt: farm.updatedAt,
  }
}