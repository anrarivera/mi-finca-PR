import { describe, it, expect } from 'vitest'
import { geodesicAreaAcres, geodesicAreaSqMeters } from './geo'

describe('geodesicAreaAcres', () => {
  it('returns 0 for fewer than 3 points', () => {
    expect(geodesicAreaAcres([])).toBe(0)
    expect(geodesicAreaAcres([{ lat: 18, lng: -66 }])).toBe(0)
    expect(geodesicAreaAcres([{ lat: 18, lng: -66 }, { lat: 18.1, lng: -66 }])).toBe(0)
  })

  it('computes ~1 acre for a 63.6m square in Puerto Rico', () => {
    // 1 acre ≈ 4046.86 m² ≈ a square of ~63.61m per side
    const lat = 18.22
    const side = 63.615
    const dLat = side / 111_320
    const dLng = side / (111_320 * Math.cos((lat * Math.PI) / 180))
    const square = [
      { lat, lng: -66.59 },
      { lat: lat + dLat, lng: -66.59 },
      { lat: lat + dLat, lng: -66.59 + dLng },
      { lat, lng: -66.59 + dLng },
    ]
    expect(geodesicAreaAcres(square)).toBeGreaterThan(0.97)
    expect(geodesicAreaAcres(square)).toBeLessThan(1.03)
  })

  it('is orientation-independent (clockwise vs counterclockwise)', () => {
    const poly = [
      { lat: 18.2, lng: -66.6 },
      { lat: 18.21, lng: -66.6 },
      { lat: 18.21, lng: -66.59 },
      { lat: 18.2, lng: -66.59 },
    ]
    const reversed = [...poly].reverse()
    expect(geodesicAreaSqMeters(poly)).toBeCloseTo(geodesicAreaSqMeters(reversed), 6)
  })
})
