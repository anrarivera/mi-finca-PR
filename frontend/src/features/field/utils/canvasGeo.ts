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
// ── Added by Claude — exported so the row-fill helpers below (and callers)
// can share the same ft⇄degree conversion instead of duplicating magic numbers.
export const FT_PER_LAT = 364000
export const FT_PER_LNG = 298000

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

// ──────────────────────────────────────────────────────────────────────────
// Added by Claude — contour (field-shape) rows.
//
// Instead of straight parallel rows, generate concentric rings that follow the
// field boundary inward (an L-shaped field gets L-shaped rings). Each ring is
// the boundary offset inward by margin, margin+spacing, margin+2·spacing, …
// Plants are then walked along each ring at the plant spacing.
//
// The inward offset uses simple per-edge offsetting with mitred joins. That is
// robust for rectangles and simple concave shapes (e.g. L / T / U); very wiggly
// or self-touching boundaries can produce artifacts, so each ring is validated
// (positive area, all vertices still inside the field) and generation stops
// once a ring would overshoot.
// ──────────────────────────────────────────────────────────────────────────
function signedAreaFt(poly: FtPoint[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

function lineIntersect(p1: FtPoint, d1: FtPoint, p2: FtPoint, d2: FtPoint): FtPoint | null {
  const denom = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(denom) < 1e-9) return null
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t }
}

// Offset a counter-clockwise polygon inward by `dist` feet (mitred joins).
function offsetInwardCCW(poly: FtPoint[], dist: number): FtPoint[] {
  const n = poly.length
  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % n]
    let dx = b.x - a.x, dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    dx /= len; dy /= len
    // Left normal (−dy, dx) points into the interior for CCW winding.
    return { p: { x: a.x - dy * dist, y: a.y + dx * dist }, d: { x: dx, y: dy } }
  })
  const out: FtPoint[] = []
  for (let i = 0; i < n; i++) {
    const prev = edges[(i - 1 + n) % n]
    const cur = edges[i]
    out.push(lineIntersect(prev.p, prev.d, cur.p, cur.d) ?? cur.p)
  }
  return out
}

// ── Generic planar geometry core ──────────────────────────────────────
// Exactly one ray-cast and one point-to-edges implementation: the
// feet-space pipeline uses them directly, and the lat/lng helpers below
// (pointInPolygon, distanceToBoundaryFt) delegate after a coordinate map.

function rayCast(p: { x: number; y: number }, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const intersect =
      poly[i].y > p.y !== poly[j].y > p.y &&
      p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x
    if (intersect) inside = !inside
  }
  return inside
}

function distToEdges(p: { x: number; y: number }, poly: Array<{ x: number; y: number }>): number {
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x, dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (d < min) min = d
  }
  return min
}

// Min distance (ft) from a feet-space point to a feet-space polygon's edges.
function distToPolyFt(p: FtPoint, poly: FtPoint[]): number {
  return distToEdges(p, poly)
}

function pointInPolyFt(p: FtPoint, poly: FtPoint[]): boolean {
  return rayCast(p, poly)
}

// Walk a closed polygon emitting a point roughly every `step` feet.
function densifyClosed(poly: FtPoint[], step: number): FtPoint[] {
  const out: FtPoint[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const segLen = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.ceil(segLen / step))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

// Concentric rows following the field shape. At each depth we offset the
// boundary inward, sample it densely, and keep only samples that genuinely sit
// at that depth (true distance to boundary ≥ depth). Contiguous survivors form
// a path; if the whole ring survives it's a closed loop, otherwise it splits
// into open segments. This makes each arm of an L/T/U field stop receiving rows
// once that arm is full, instead of cramming overlapping rows into it.
export function generateContourRows(
  boundary: Array<{ lat: number; lng: number }>,
  opts: { marginFt: number; rowSpacingFt: number; maxRings?: number }
): Array<{ path: Array<{ lat: number; lng: number }>; closed: boolean }> {
  if (boundary.length < 3) return []
  const lat0 = boundary[0].lat, lng0 = boundary[0].lng
  let polyFt = boundary.map(p => toFt(p, lat0, lng0))
  if (signedAreaFt(polyFt) < 0) polyFt = [...polyFt].reverse() // ensure CCW
  const margin = Math.max(0, opts.marginFt)
  const spacing = Math.max(1, opts.rowSpacingFt)
  const maxRings = opts.maxRings ?? 500
  const sampleStep = Math.max(2, Math.min(spacing, 8) / 2)
  const tol = Math.max(1, spacing * 0.15)

  const out: Array<{ path: Array<{ lat: number; lng: number }>; closed: boolean }> = []
  for (let k = 0; k < maxRings; k++) {
    const depth = margin + k * spacing
    const samples = densifyClosed(offsetInwardCCW(polyFt, depth), sampleStep)
    // A sample is valid if it's inside the field and at least `depth` from the
    // boundary (i.e. that part of the field really is this deep).
    const flags = samples.map(s => pointInPolyFt(s, polyFt) && distToPolyFt(s, polyFt) >= depth - tol)
    if (flags.every(f => !f)) break // no part of the field is this deep → done

    const n = samples.length
    if (flags.every(f => f)) {
      out.push({ path: samples.map(s => ftToLatLng(s, lat0, lng0)), closed: true })
      continue
    }
    // Group contiguous valid runs, starting from an invalid index so runs don't
    // wrap across the array seam.
    let start = 0
    while (start < n && flags[start]) start++
    let run: FtPoint[] = []
    for (let o = 0; o < n; o++) {
      const idx = (start + o) % n
      if (flags[idx]) {
        run.push(samples[idx])
      } else if (run.length) {
        if (run.length >= 2) out.push({ path: run.map(s => ftToLatLng(s, lat0, lng0)), closed: false })
        run = []
      }
    }
    if (run.length >= 2) out.push({ path: run.map(s => ftToLatLng(s, lat0, lng0)), closed: false })
  }
  return out
}

// Place a plant every `spacingFt` along a polyline; pass closed=true for rings.
export function placePlantsAlongPath(
  points: Array<{ lat: number; lng: number }>,
  spacingFt: number,
  closed: boolean
): Array<{ lat: number; lng: number }> {
  if (points.length < 2) return []
  const spacing = Math.max(1, spacingFt)
  const pts = closed ? [...points, points[0]] : points
  const out: Array<{ lat: number; lng: number }> = []
  let nextAt = 0
  let traveled = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const segLen = distanceFt(a.lat, a.lng, b.lat, b.lng)
    if (segLen === 0) continue
    while (nextAt <= traveled + segLen + 1e-6) {
      const t = (nextAt - traveled) / segLen
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
      nextAt += spacing
    }
    traveled += segLen
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// Added by Claude — multi-row "fill the field" geometry.
//
// These power the new "Rellenar con hileras" tool, which generates many
// evenly spaced parallel rows at once instead of drawing one row by hand.
// ──────────────────────────────────────────────────────────────────────────

// Ray-casting point-in-polygon for plain { lat, lng } points (no Leaflet
// dependency, unlike geoUtils.isPointInPolygon). Used to clip generated rows
// to non-rectangular fields so plants don't spill outside the boundary.
export function pointInPolygon(
  pt: { lat: number; lng: number },
  polygon: Array<{ lat: number; lng: number }>
): boolean {
  return rayCast(
    { x: pt.lng, y: pt.lat },
    polygon.map(p => ({ x: p.lng, y: p.lat }))
  )
}

// ── Field-relative orientation ────────────────────────────────────────
// Rows must follow the field's own orientation, not the compass. We work in a
// flat "feet" plane (lng→x·FT_PER_LNG, lat→y·FT_PER_LAT relative to a corner),
// find the field's minimum-area bounding rectangle, and lay rows out along its
// axes. That way a field drawn at any angle gets rows parallel to its sides.

type FtPoint = { x: number; y: number }

function toFt(p: { lat: number; lng: number }, lat0: number, lng0: number): FtPoint {
  return { x: (p.lng - lng0) * FT_PER_LNG, y: (p.lat - lat0) * FT_PER_LAT }
}
function ftToLatLng(pt: FtPoint, lat0: number, lng0: number): { lat: number; lng: number } {
  return { lat: lat0 + pt.y / FT_PER_LAT, lng: lng0 + pt.x / FT_PER_LNG }
}

// Andrew's monotone-chain convex hull (counter-clockwise).
function convexHull(points: FtPoint[]): FtPoint[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o: FtPoint, a: FtPoint, b: FtPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: FtPoint[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: FtPoint[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

type OrientedRect = {
  angle: number      // rotation of the "width" axis, radians
  center: FtPoint    // centre in feet-space
  width: number      // extent along the angle axis
  height: number     // extent perpendicular to it
}

// Minimum-area bounding rectangle: the optimal rect shares an edge with the
// convex hull, so we test each hull edge as the candidate orientation.
function minAreaRect(hull: FtPoint[]): OrientedRect {
  if (hull.length < 3) {
    const xs = hull.map(p => p.x), ys = hull.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    return { angle: 0, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, width: maxX - minX, height: maxY - minY }
  }
  let best: OrientedRect | null = null
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    const edgeAngle = Math.atan2(b.y - a.y, b.x - a.x)
    const cos = Math.cos(-edgeAngle), sin = Math.sin(-edgeAngle)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of hull) {
      const rx = p.x * cos - p.y * sin
      const ry = p.x * sin + p.y * cos
      if (rx < minX) minX = rx; if (rx > maxX) maxX = rx
      if (ry < minY) minY = ry; if (ry > maxY) maxY = ry
    }
    const w = maxX - minX, h = maxY - minY
    if (!best || w * h < best.width * best.height) {
      // centre back in the original frame
      const cxr = (minX + maxX) / 2, cyr = (minY + maxY) / 2
      const cos2 = Math.cos(edgeAngle), sin2 = Math.sin(edgeAngle)
      best = {
        angle: edgeAngle,
        center: { x: cxr * cos2 - cyr * sin2, y: cxr * sin2 + cyr * cos2 },
        width: w,
        height: h,
      }
    }
  }
  return best!
}

// The field's long/short side lengths in feet (oriented, not axis-aligned).
export function getFieldDimensions(
  boundary: Array<{ lat: number; lng: number }>
): { longFt: number; shortFt: number } {
  if (boundary.length < 3) return { longFt: 0, shortFt: 0 }
  const lat0 = boundary[0].lat, lng0 = boundary[0].lng
  const rect = minAreaRect(convexHull(boundary.map(p => toFt(p, lat0, lng0))))
  return {
    longFt: Math.round(Math.max(rect.width, rect.height)),
    shortFt: Math.round(Math.min(rect.width, rect.height)),
  }
}

// Added by Claude — shortest distance (in feet) from a point to the field's
// boundary edges. Used to keep a real margin between rows and the field limit:
// a plant is only kept if it's both inside the field AND at least `margin` feet
// from every edge. This insets the planting area on ALL sides for any shape,
// so the fill no longer crowds the boundary (which was over-counting plants).
export function distanceToBoundaryFt(
  pt: { lat: number; lng: number },
  polygon: Array<{ lat: number; lng: number }>
): number {
  if (polygon.length < 2) return Infinity
  const lat0 = polygon[0].lat, lng0 = polygon[0].lng
  return distToEdges(
    toFt(pt, lat0, lng0),
    polygon.map(q => toFt(q, lat0, lng0))
  )
}

// Added by Claude — the most parallel rows that fit along the chosen axis,
// keeping `marginFt` clear at both ends of the stacking direction. Used to cap
// the "Número de hileras" input so the user can't request more than fit.
export function maxRowsThatFit(
  boundary: Array<{ lat: number; lng: number }>,
  orientation: 'long' | 'short',
  marginFt: number,
  rowSpacingFt: number,
): number {
  if (boundary.length < 3) return 1
  const lat0 = boundary[0].lat, lng0 = boundary[0].lng
  const rect = minAreaRect(convexHull(boundary.map(p => toFt(p, lat0, lng0))))
  const longLen = Math.max(rect.width, rect.height)
  const shortLen = Math.min(rect.width, rect.height)
  // Rows along the long axis stack across the short side, and vice versa.
  const stackFt = (orientation === 'long' ? shortLen : longLen) - 2 * Math.max(0, marginFt)
  if (stackFt < 0) return 1
  return Math.max(1, Math.floor(stackFt / Math.max(1, rowSpacingFt)) + 1)
}

export type FillRowsOptions = {
  // Rows run along the field's 'long' or 'short' axis (relative to the field's
  // own orientation, found via the minimum-area bounding rectangle).
  orientation: 'long' | 'short'
  count: number             // exact number of rows to draw (≥ 1)
  marginFt: number          // walkway / transit margin kept clear at row ends
  rowSpacingFt: number      // centre-to-centre distance between adjacent rows
  rowLengthFt: number | null // fixed row length, or null = longest that fits
}

// Generate `count` evenly spaced parallel rows aligned to the field's
// orientation, centred within the field. Returns bare start/end coordinates;
// the caller turns each into a FieldRow with plants (and clips plants to the
// real boundary). For a 100×50 ft field with a 10 ft margin and rowLengthFt
// null, rows along the long axis are 80 ft (100 − 2·10).
export function generateFillRows(
  boundary: Array<{ lat: number; lng: number }>,
  opts: FillRowsOptions
): Array<{ startLat: number; startLng: number; endLat: number; endLng: number }> {
  if (boundary.length < 3) return []

  const lat0 = boundary[0].lat, lng0 = boundary[0].lng
  const rect = minAreaRect(convexHull(boundary.map(p => toFt(p, lat0, lng0))))

  // Unit vectors for the rect's two axes (in feet-space).
  const wAxis: FtPoint = { x: Math.cos(rect.angle), y: Math.sin(rect.angle) }
  const hAxis: FtPoint = { x: -Math.sin(rect.angle), y: Math.cos(rect.angle) }

  // Pick which axis the rows run along.
  const widthIsLong = rect.width >= rect.height
  const alongIsWidth = opts.orientation === 'long' ? widthIsLong : !widthIsLong
  const alongAxis = alongIsWidth ? wAxis : hAxis
  const stackAxis = alongIsWidth ? hAxis : wAxis
  const alongLen = alongIsWidth ? rect.width : rect.height

  const margin = Math.max(0, opts.marginFt)
  const spacing = Math.max(1, opts.rowSpacingFt)
  const count = Math.max(1, Math.floor(opts.count))

  const usableAlong = alongLen - 2 * margin
  if (usableAlong <= 0) return []
  const length = opts.rowLengthFt == null ? usableAlong : Math.min(opts.rowLengthFt, usableAlong)
  if (length <= 0) return []
  const halfLen = length / 2

  const rows: Array<{ startLat: number; startLng: number; endLat: number; endLng: number }> = []
  for (let i = 0; i < count; i++) {
    // Centre the stack of rows on the field centre.
    const stackOffset = (i - (count - 1) / 2) * spacing
    const cx = rect.center.x + stackAxis.x * stackOffset
    const cy = rect.center.y + stackAxis.y * stackOffset
    const start = ftToLatLng({ x: cx - alongAxis.x * halfLen, y: cy - alongAxis.y * halfLen }, lat0, lng0)
    const end = ftToLatLng({ x: cx + alongAxis.x * halfLen, y: cy + alongAxis.y * halfLen }, lat0, lng0)
    rows.push({ startLat: start.lat, startLng: start.lng, endLat: end.lat, endLng: end.lng })
  }
  return rows
}