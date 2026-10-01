import { describe, it, expect } from 'vitest'
import {
  generateFillRows,
  transformFillRows,
  pointInPolygon,
  distanceToBoundaryFt,
  distanceFt,
  calculateRowPlantPositions,
  getFieldDimensions,
  farmBoundaryToBBox,
  getCanvasScale,
  latlngToCanvas,
  areaFt2,
  ft2ToAcres,
  FT_PER_LAT,
  ftPerLng,
} from './canvasGeo'
import { geodesicAreaAcres } from '@/lib/geo'

// A 100 × 50 ft axis-aligned rectangle. x → east (lng), y → north (lat).
const LAT0 = 18.0
const LNG0 = -66.0
const FT_PER_LNG = ftPerLng(LAT0)
const pt = (xFt: number, yFt: number) => ({
  lat: LAT0 + yFt / FT_PER_LAT,
  lng: LNG0 + xFt / FT_PER_LNG,
})
const FIELD = [pt(0, 0), pt(100, 0), pt(100, 50), pt(0, 50)]

const xFt = (p: { lng: number }) => (p.lng - LNG0) * FT_PER_LNG
const yFt = (p: { lat: number }) => (p.lat - LAT0) * FT_PER_LAT

// One row, 10 ft margin. 'long' → line y=25, x from 10 to 90 (east-west).
const oneRow = (
  orientation: 'long' | 'short' = 'long',
  rowLengthFt: number | null = null,
) =>
  generateFillRows(FIELD, {
    orientation,
    count: 1,
    marginFt: 10,
    rowSpacingFt: 12,
    rowLengthFt,
  })

const BASE = {
  rotateDeg: 0,
  offsetAlongFt: 0,
  offsetAcrossFt: 0,
  orientation: 'long' as const,
  spacingFt: 10,
  marginFt: 10,
}

describe('transformFillRows', () => {
  it('with no transform fills the row wall-to-wall inside the margin', () => {
    const [positions] = transformFillRows(oneRow(), FIELD, BASE)
    // Plants every 10 ft from x=10 to x=90 on the centre line.
    expect(positions).toHaveLength(9)
    expect(positions.every(p => Math.abs(yFt(p) - 25) < 0.1)).toBe(true)
    expect(Math.round(xFt(positions[0]))).toBe(10)
    expect(Math.round(xFt(positions[positions.length - 1]))).toBe(90)
  })

  it('never keeps a plant outside the field or inside the margin', () => {
    for (const opts of [
      { ...BASE, offsetAlongFt: 33, offsetAcrossFt: -14, rotateDeg: 27 },
      { ...BASE, rotateDeg: 90 },
      { ...BASE, offsetAcrossFt: 18 },
    ]) {
      const [positions] = transformFillRows(oneRow(), FIELD, opts)
      for (const p of positions) {
        expect(pointInPolygon(p, FIELD)).toBe(true)
        expect(distanceToBoundaryFt(p, FIELD)).toBeGreaterThanOrEqual(10 - 0.01)
      }
    }
  })

  it('plants move with the row and clip off — none appear on the far side', () => {
    // 'long' rows run east-west, so +along slides the segment east to
    // x=15..95; the x=95 end enters the margin and clips. Nothing shows up
    // at the west end.
    const [positions] = transformFillRows(oneRow(), FIELD, { ...BASE, offsetAlongFt: 5 })
    expect(positions).toHaveLength(8)
    expect(Math.round(xFt(positions[0]))).toBe(15)
    expect(Math.round(xFt(positions[positions.length - 1]))).toBe(85)
  })

  it('sliding a full row half a field along leaves a half-length row', () => {
    // The plantains-east / oranges-west layout: a wall-to-wall row pushed
    // 40 ft along keeps only its far half; pushed 40 ft the other way,
    // only its near half. The two halves complement without overlapping.
    const [east] = transformFillRows(oneRow(), FIELD, { ...BASE, offsetAlongFt: 40 })
    expect(east.map(p => Math.round(xFt(p)))).toEqual([50, 60, 70, 80, 90])

    const [west] = transformFillRows(oneRow(), FIELD, { ...BASE, offsetAlongFt: -40 })
    expect(west.map(p => Math.round(xFt(p)))).toEqual([10, 20, 30, 40, 50])
  })

  it('the arrows follow the row orientation, not the compass', () => {
    // 'short' rows run north-south (x=50, y=10..40 → plants y=15,25,35).
    const shortRow = oneRow('short')
    const opts = { ...BASE, orientation: 'short' as const }

    // +along slides ALONG the vertical row — northward here: y=25,35,45,
    // and y=45 clips against the top margin.
    const [along] = transformFillRows(shortRow, FIELD, { ...opts, offsetAlongFt: 10 })
    expect(along.map(p => Math.round(yFt(p)))).toEqual([25, 35])
    expect(along.every(p => Math.abs(xFt(p) - 50) < 0.1)).toBe(true)

    // +across moves BETWEEN rows — eastward here: same plants, x=70.
    const [across] = transformFillRows(shortRow, FIELD, { ...opts, offsetAcrossFt: 20 })
    expect(across.map(p => Math.round(yFt(p)))).toEqual([15, 25, 35])
    expect(across.every(p => Math.abs(xFt(p) - 70) < 0.1)).toBe(true)
  })

  it('rotating 90° clips the row to what fits across the short axis', () => {
    const [positions] = transformFillRows(oneRow(), FIELD, { ...BASE, rotateDeg: 90 })
    // The 80 ft segment turns vertical through x=50; only y=15,25,35 clear
    // the 10 ft margin — the rest clips off.
    expect(positions).toHaveLength(3)
    expect(positions.every(p => Math.abs(xFt(p) - 50) < 0.1)).toBe(true)
  })

  it('after rotating, along/across still track the rows', () => {
    // A short 20 ft row rotated 90° becomes vertical through x=50 with
    // plants at y=15,25,35. Sliding +along then moves it along the
    // ROTATED axis (north-south), not east-west: one end clips against
    // the margin and the survivors stay on x=50.
    const shortSeg = oneRow('long', 20)
    const [atRest] = transformFillRows(shortSeg, FIELD, { ...BASE, rotateDeg: 90 })
    expect(atRest.map(p => Math.round(yFt(p))).sort((a, b) => a - b)).toEqual([15, 25, 35])

    const [slid] = transformFillRows(shortSeg, FIELD, {
      ...BASE, rotateDeg: 90, offsetAlongFt: 10,
    })
    expect(slid.every(p => Math.abs(xFt(p) - 50) < 0.1)).toBe(true)
    expect(slid.map(p => Math.round(yFt(p))).sort((a, b) => a - b)).toEqual([15, 25])
  })

  it('pushing a row into the margin corridor removes it entirely', () => {
    // y=25+20=45 is only 5 ft from the top edge — inside the margin.
    const [positions] = transformFillRows(oneRow(), FIELD, { ...BASE, offsetAcrossFt: 20 })
    expect(positions).toHaveLength(0)
  })

  it('fixed-length rows behave the same: keep their length, lose what exits', () => {
    const fixed = oneRow('long', 40) // x from 30 to 70, centred
    const [atRest] = transformFillRows(fixed, FIELD, BASE)
    expect(atRest).toHaveLength(5) // x = 30, 40, 50, 60, 70

    // Slide 40 ft along: segment covers x=70..110, only 70/80/90 survive.
    const [shifted] = transformFillRows(fixed, FIELD, { ...BASE, offsetAlongFt: 40 })
    expect(shifted.map(p => Math.round(xFt(p)))).toEqual([70, 80, 90])
  })
})

// ── Real-world scale ──────────────────────────────────────────────────
// The fixtures above are built FROM the module's own conversion, so they
// can't notice a wrong feet-per-degree factor. These check the editor's
// numbers against independent ground truth: great-circle distances and
// the geodesic acreage the farm itself reports.

const R_FT = 6378137 / 0.3048
const rad = (deg: number) => (deg * Math.PI) / 180

function haversineFt(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_FT * Math.asin(Math.sqrt(h))
}

// A w × h ft rectangle whose sides are TRUE ground feet at this latitude.
function groundRect(lat: number, lng: number, wFt: number, hFt: number) {
  const dLat = hFt / (R_FT * rad(1))
  const dLng = wFt / (R_FT * rad(1) * Math.cos(rad(lat + dLat / 2)))
  return [
    { lat, lng },
    { lat, lng: lng + dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat + dLat, lng },
  ]
}

// Relative difference, for "within x%" assertions.
const relDiff = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe('feet per degree', () => {
  it('a degree of longitude in Puerto Rico is ~347,000 ft, not 298,000', () => {
    expect(ftPerLng(18.2)).toBeGreaterThan(346_000)
    expect(ftPerLng(18.2)).toBeLessThan(348_000)
  })

  it('scales with cos(latitude) and meets the latitude factor at the equator', () => {
    expect(ftPerLng(0)).toBeCloseTo(FT_PER_LAT, 6)
    expect(ftPerLng(60)).toBeCloseTo(FT_PER_LAT / 2, 6)
    // Same for the southern hemisphere.
    expect(ftPerLng(-18.2)).toBeCloseTo(ftPerLng(18.2), 6)
  })

  it('distanceFt agrees with the great-circle distance in every direction', () => {
    const origin = { lat: 18.2208, lng: -66.5901 }
    for (const [dLat, dLng] of [
      [0, 0.001],        // due east — the direction that was 14% short
      [0.001, 0],        // due north
      [0.0007, 0.0007],  // diagonal
      [-0.0004, 0.0012],
    ]) {
      const other = { lat: origin.lat + dLat, lng: origin.lng + dLng }
      const measured = distanceFt(origin.lat, origin.lng, other.lat, other.lng)
      expect(relDiff(measured, haversineFt(origin, other))).toBeLessThan(0.001)
    }
  })

  it('stays accurate away from Puerto Rico', () => {
    for (const lat of [10, 25, -12]) {
      const a = { lat, lng: -61 }
      const b = { lat, lng: -60.999 }
      expect(relDiff(distanceFt(a.lat, a.lng, b.lat, b.lng), haversineFt(a, b))).toBeLessThan(0.001)
    }
  })
})

describe('field measurements match the ground', () => {
  // 1 acre = 43,560 ft² = a square of 208.71 ft per side.
  const ACRE_SQUARE = groundRect(18.22, -66.59, 208.71, 208.71)

  it('a one-acre square reads as one acre on the field card', () => {
    // Exactly the computation fieldSummaryCard runs.
    const bbox = farmBoundaryToBBox(ACRE_SQUARE)
    const scale = getCanvasScale(bbox)
    const pts = ACRE_SQUARE.map(p => latlngToCanvas(p.lat, p.lng, bbox))
    const acres = ft2ToAcres(areaFt2(pts, scale))
    expect(relDiff(acres, 1)).toBeLessThan(0.002)
  })

  it('a field measures the same area as a farm with the same boundary', () => {
    const plot = groundRect(18.05, -66.2, 640, 410)
    const bbox = farmBoundaryToBBox(plot)
    const scale = getCanvasScale(bbox)
    const pts = plot.map(p => latlngToCanvas(p.lat, p.lng, bbox))
    const fieldAcres = ft2ToAcres(areaFt2(pts, scale))
    expect(relDiff(fieldAcres, geodesicAreaAcres(plot))).toBeLessThan(0.002)
  })

  it('reports the true side lengths of a field', () => {
    const { longFt, shortFt } = getFieldDimensions(groundRect(18.22, -66.59, 300, 120))
    expect(Math.abs(longFt - 300)).toBeLessThanOrEqual(1)
    expect(Math.abs(shortFt - 120)).toBeLessThanOrEqual(1)
  })

  it('an east-west row gets every plant its real length has room for', () => {
    // 100 ft of row at 6 ft spacing holds 17 plants (0, 6, … 96). Measured
    // 14% short, the same row was only given 15.
    const [a, b] = groundRect(18.22, -66.59, 100, 50)
    const plants = calculateRowPlantPositions(a.lat, a.lng, b.lat, b.lng, 6)
    expect(plants).toHaveLength(17)
  })

  it('rows stacked across a north-south field are spaced in real feet', () => {
    // A field 100 ft wide (east-west) and 400 ft long: rows run along the
    // long side and stack east-west, 12 ft apart.
    const field = groundRect(18.22, -66.59, 100, 400)
    const rows = generateFillRows(field, {
      orientation: 'long', count: 3, marginFt: 10, rowSpacingFt: 12, rowLengthFt: null,
    })
    expect(rows).toHaveLength(3)
    const gap = haversineFt(
      { lat: rows[0].startLat, lng: rows[0].startLng },
      { lat: rows[1].startLat, lng: rows[1].startLng },
    )
    expect(Math.abs(gap - 12)).toBeLessThan(0.05)
  })

  it('the margin kept from an east or west edge is a real margin', () => {
    const field = groundRect(18.22, -66.59, 200, 80)
    const [positions] = transformFillRows(
      generateFillRows(field, {
        orientation: 'long', count: 1, marginFt: 10, rowSpacingFt: 12, rowLengthFt: null,
      }),
      field,
      { rotateDeg: 0, offsetAlongFt: 0, offsetAcrossFt: 0, orientation: 'long', spacingFt: 10, marginFt: 10 },
    )
    const westEdge = { lat: positions[0].lat, lng: field[0].lng }
    expect(Math.abs(haversineFt(westEdge, positions[0]) - 10)).toBeLessThan(0.05)
  })
})
