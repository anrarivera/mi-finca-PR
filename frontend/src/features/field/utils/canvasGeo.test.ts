import { describe, it, expect } from 'vitest'
import {
  generateFillRows,
  transformFillRows,
  pointInPolygon,
  distanceToBoundaryFt,
  FT_PER_LAT,
  FT_PER_LNG,
} from './canvasGeo'

// A 100 × 50 ft axis-aligned rectangle. x → east (lng), y → north (lat).
const LAT0 = 18.0
const LNG0 = -66.0
const pt = (xFt: number, yFt: number) => ({
  lat: LAT0 + yFt / FT_PER_LAT,
  lng: LNG0 + xFt / FT_PER_LNG,
})
const FIELD = [pt(0, 0), pt(100, 0), pt(100, 50), pt(0, 50)]

const xFt = (p: { lng: number }) => (p.lng - LNG0) * FT_PER_LNG
const yFt = (p: { lat: number }) => (p.lat - LAT0) * FT_PER_LAT

// One row along the long axis, 10 ft margin → line y=25, x from 10 to 90.
const oneRow = (rowLengthFt: number | null = null) =>
  generateFillRows(FIELD, {
    orientation: 'long',
    count: 1,
    marginFt: 10,
    rowSpacingFt: 12,
    rowLengthFt,
  })

const BASE = {
  rotateDeg: 0,
  offsetEastFt: 0,
  offsetNorthFt: 0,
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
      { ...BASE, offsetEastFt: 33, offsetNorthFt: -14, rotateDeg: 27 },
      { ...BASE, rotateDeg: 90 },
      { ...BASE, offsetNorthFt: 18 },
    ]) {
      const [positions] = transformFillRows(oneRow(), FIELD, opts)
      for (const p of positions) {
        expect(pointInPolygon(p, FIELD)).toBe(true)
        expect(distanceToBoundaryFt(p, FIELD)).toBeGreaterThanOrEqual(10 - 0.01)
      }
    }
  })

  it('plants move with the row and clip off — none appear on the far side', () => {
    // Offset 5 ft east: the whole segment shifts to x=15..95; the x=95 end
    // enters the margin and clips. Nothing shows up at the west end.
    const [positions] = transformFillRows(oneRow(), FIELD, { ...BASE, offsetEastFt: 5 })
    expect(positions).toHaveLength(8)
    expect(Math.round(xFt(positions[0]))).toBe(15)
    expect(Math.round(xFt(positions[positions.length - 1]))).toBe(85)
  })

  it('shifting a full row half a field east leaves a half-length eastern row', () => {
    // The plantains-east / oranges-west layout: a wall-to-wall row pushed
    // 40 ft east keeps only its eastern half; pushed 40 ft west, only its
    // western half. The two halves complement without overlapping.
    const [east] = transformFillRows(oneRow(), FIELD, { ...BASE, offsetEastFt: 40 })
    expect(east.map(p => Math.round(xFt(p)))).toEqual([50, 60, 70, 80, 90])

    const [west] = transformFillRows(oneRow(), FIELD, { ...BASE, offsetEastFt: -40 })
    expect(west.map(p => Math.round(xFt(p)))).toEqual([10, 20, 30, 40, 50])
  })

  it('rotating 90° clips the row to what fits across the short axis', () => {
    const [positions] = transformFillRows(oneRow(), FIELD, { ...BASE, rotateDeg: 90 })
    // The 80 ft segment turns vertical through x=50; only y=15,25,35 clear
    // the 10 ft margin — the rest clips off.
    expect(positions).toHaveLength(3)
    expect(positions.every(p => Math.abs(xFt(p) - 50) < 0.1)).toBe(true)
  })

  it('pushing a row into the margin corridor removes it entirely', () => {
    // y=25+20=45 is only 5 ft from the top edge — inside the margin.
    const [positions] = transformFillRows(oneRow(), FIELD, { ...BASE, offsetNorthFt: 20 })
    expect(positions).toHaveLength(0)
  })

  it('fixed-length rows behave the same: keep their length, lose what exits', () => {
    const fixed = oneRow(40) // x from 30 to 70, centred
    const [atRest] = transformFillRows(fixed, FIELD, BASE)
    expect(atRest).toHaveLength(5) // x = 30, 40, 50, 60, 70

    // Shift 40 ft east: segment covers x=70..110, only 70/80/90 survive.
    const [shifted] = transformFillRows(fixed, FIELD, { ...BASE, offsetEastFt: 40 })
    expect(shifted.map(p => Math.round(xFt(p)))).toEqual([70, 80, 90])
  })
})
