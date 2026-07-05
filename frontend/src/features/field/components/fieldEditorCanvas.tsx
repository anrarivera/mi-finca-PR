import { useRef, useState, useEffect, useMemo } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type { CanvasPoint, FieldShape, FieldRow, PlantInstance } from '../types'
import { getCropById } from '../data/cropLibrary'
import {
  latlngToCanvas, canvasDistanceFt, perimeterFt,
  areaFt2, ft2ToAcres, formatFt, midpoint,
  getCanvasScale, CANVAS_W, CANVAS_H,
} from '../utils/canvasGeo'
import type { BBox } from '../utils/canvasGeo'
import type { PlacedField } from '../types'

const GRID_SIZE = 40
const MIN_SCALE = 0.5
const MAX_SCALE = 8

type Props = {
  shape: FieldShape
  mode: string
  points: CanvasPoint[]
  mousePos: CanvasPoint | null
  selectedPointIndex: number | null
  widthFt: number
  heightFt: number
  rows: FieldRow[]
  freePlants: PlantInstance[]
  fillPreviewRows?: FieldRow[] // Added by Claude — live preview of the fill tool
  rowStartPoint: CanvasPoint | null
  selectedFreeCropId: string
  bbox: BBox | null
  farmBoundary: Array<{ lat: number; lng: number }>
  savedFields: PlacedField[]
  activeFieldId: string | null
  selectedFieldId: string | null
  onAddPoint: (p: CanvasPoint) => void
  onSetRectangle: (p1: CanvasPoint, p2: CanvasPoint) => void
  onMovePoint: (index: number, p: CanvasPoint) => void
  onSelectPoint: (index: number) => void
  onMouseMove: (p: CanvasPoint | null) => void
  onComplete: () => void
  onRowClick: (p: CanvasPoint) => void
  onPlaceFreePlant: (p: CanvasPoint, bbox: BBox) => void
  onClickField: (id: string) => void
  // ── Added by Claude — click-to-select rows / plants in complete mode ──
  selectedRowId?: string | null
  selectedPlantId?: string | null
  onSelectRow?: (rowId: string) => void
  onSelectPlant?: (plantId: string) => void
  // Added by Claude — drag the selected row to move it (lat/lng delta)
  onMoveRow?: (rowId: string, dLat: number, dLng: number) => void
}

export default function FieldEditorCanvas({
  shape, mode, points, mousePos, selectedPointIndex,
  rows, freePlants, rowStartPoint, // Claude: removed unused `widthFt`, `heightFt` (TS6133 cleanup)
  fillPreviewRows = [], // Added by Claude — fill-tool preview rows
  selectedFreeCropId, bbox, farmBoundary,
  savedFields, activeFieldId, selectedFieldId,
  onAddPoint, onSetRectangle, onMovePoint, onSelectPoint,
  onMouseMove, onComplete, onRowClick, onPlaceFreePlant,
  onClickField,
  // Added by Claude — click-to-select rows / plants
  selectedRowId = null, selectedPlantId = null, onSelectRow, onSelectPlant, onMoveRow,
}: Props) {
  const [scale, setScale] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  // ── Added by Claude — mirror scale/pan in refs so the wheel handler reads
  // current values without re-subscribing, and so the zoom math is applied
  // exactly once (React StrictMode double-invokes state *updater* functions,
  // which is why the old nested setState-in-updater made zoom jump). ──
  const scaleRef = useRef(scale)
  const panXRef = useRef(panX)
  const panYRef = useRef(panY)
  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { panXRef.current = panX }, [panX])
  useEffect(() => { panYRef.current = panY }, [panY])

  // ── Added by Claude — zoom toward a focal point (cx, cy in content pixels),
  // keeping that point fixed under the cursor. The previous formula
  // `pan - mouse*(next-prev)/prev` was only correct when pan was 0; after any
  // pan it drifted, which is what made zooming feel wonky. ──
  function applyZoom(factor: number, cx: number, cy: number) {
    const prev = scaleRef.current
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * factor))
    if (next === prev) return
    const ratio = next / prev
    const nextPanX = cx - (cx - panXRef.current) * ratio
    const nextPanY = cy - (cy - panYRef.current) * ratio
    scaleRef.current = next
    panXRef.current = nextPanX
    panYRef.current = nextPanY
    setScale(next)
    setPanX(nextPanX)
    setPanY(nextPanY)
  }

  const isPanning = useRef(false)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const spacePressed = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragIndex = useRef<number | null>(null)
  const mouseDownPos = useRef<CanvasPoint | null>(null)
  const rectStart = useRef<CanvasPoint | null>(null)
  const isDrawingRect = useRef(false)
  const panMoved = useRef(false) // Added by Claude — distinguishes a pan-drag from a click
  const rowDragRef = useRef<{ id: string; last: CanvasPoint } | null>(null) // Added by Claude — selected-row drag

  // ── Canvas scale (ft per pixel) ───────────────────────────────────
  const canvasScale = useMemo(() => {
    if (!bbox) return null
    return getCanvasScale(bbox)
  }, [bbox])

  // ── Farm boundary projected to canvas pixels ──────────────────────
  const farmBoundaryCanvas = useMemo(() => {
    if (!bbox || farmBoundary.length < 3) return []
    return farmBoundary.map(p => latlngToCanvas(p.lat, p.lng, bbox))
  }, [bbox, farmBoundary])

  const farmBoundaryStr = farmBoundaryCanvas.map(p => `${p.x},${p.y}`).join(' ')

  // ── Rows and plants projected from lat/lng ────────────────────────
  const rowsOnCanvas = useMemo(() => {
    if (!bbox) return []
    return rows.map(row => ({
      ...row,
      startPx: latlngToCanvas(row.startLat, row.startLng, bbox),
      endPx: latlngToCanvas(row.endLat, row.endLng, bbox),
      // Added by Claude — contour rows carry a polyline path
      pathPx: row.path ? row.path.map(p => latlngToCanvas(p.lat, p.lng, bbox)) : null,
      plantsOnCanvas: row.plants.map(p => ({
        ...p,
        px: latlngToCanvas(p.lat, p.lng, bbox),
      })),
    }))
  }, [rows, bbox])

  const freePlantsOnCanvas = useMemo(() => {
    if (!bbox) return []
    return freePlants.map(p => ({
      ...p,
      px: latlngToCanvas(p.lat, p.lng, bbox),
    }))
  }, [freePlants, bbox])

  // ── Added by Claude — fill-tool preview rows projected to canvas ──────
  const fillPreviewOnCanvas = useMemo(() => {
    if (!bbox) return []
    return fillPreviewRows.map(row => ({
      ...row,
      startPx: latlngToCanvas(row.startLat, row.startLng, bbox),
      endPx: latlngToCanvas(row.endLat, row.endLng, bbox),
      pathPx: row.path ? row.path.map(p => latlngToCanvas(p.lat, p.lng, bbox)) : null,
      plantsOnCanvas: row.plants.map(p => ({
        ...p,
        px: latlngToCanvas(p.lat, p.lng, bbox),
      })),
    }))
  }, [fillPreviewRows, bbox])

  // ── Live measurement calculations ─────────────────────────────────
  const measurements = useMemo(() => {
    if (!canvasScale) return null

    // Current segment length (last point to mouse)
    const currentSegmentFt = mousePos && points.length > 0 && mode === 'drawing'
      ? canvasDistanceFt(points[points.length - 1], mousePos, canvasScale)
      : null

    // Rectangle dimensions
    const rectWidthFt = mousePos && rectStart.current && isDrawingRect.current
      ? Math.abs(mousePos.x - rectStart.current.x) * canvasScale.ftPerPixelX
      : null
    const rectHeightFt = mousePos && rectStart.current && isDrawingRect.current
      ? Math.abs(mousePos.y - rectStart.current.y) * canvasScale.ftPerPixelY
      : null

    // Total perimeter so far (open polygon)
    const openPoints = mousePos && mode === 'drawing' ? [...points, mousePos] : points
    const runningPerimeterFt = openPoints.length >= 2
      ? openPoints.reduce((total, p, i) => {
          if (i === 0) return 0
          return total + canvasDistanceFt(openPoints[i - 1], p, canvasScale)
        }, 0)
      : 0

    // Completed polygon metrics
    const totalPerimeterFt = points.length >= 3
      ? perimeterFt(points, canvasScale)
      : null
    const totalAreaFt2 = points.length >= 3
      ? areaFt2(points, canvasScale)
      : null
    const totalAcres = totalAreaFt2 ? ft2ToAcres(totalAreaFt2) : null

    // Per-edge lengths for completed polygon
    const edgeLengths = points.length >= 2
      ? points.map((p, i) => {
          const next = points[(i + 1) % points.length]
          const len = canvasDistanceFt(p, next, canvasScale)
          const mid = midpoint(p, next)
          return { len, mid, label: formatFt(len) }
        })
      : []

    return {
      currentSegmentFt,
      rectWidthFt,
      rectHeightFt,
      runningPerimeterFt,
      totalPerimeterFt,
      totalAreaFt2,
      totalAcres,
      edgeLengths,
    }
  }, [canvasScale, mousePos, points, mode])

  // ── Keyboard ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') { e.preventDefault(); spacePressed.current = true }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') { spacePressed.current = false; isPanning.current = false }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // ── Scroll wheel zoom ─────────────────────────────────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = wrapper!.getBoundingClientRect()
      const mouseX = e.clientX - rect.left - 32
      const mouseY = e.clientY - rect.top - 24
      // Added by Claude — correct, single-pass zoom-to-cursor (see applyZoom)
      applyZoom(e.deltaY > 0 ? 0.9 : 1.1, mouseX, mouseY)
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Coordinate helpers ────────────────────────────────────────────
  function getSVGPoint(e: React.MouseEvent | MouseEvent): CanvasPoint {
    const wrapper = wrapperRef.current
    if (!wrapper) return { x: 0, y: 0 }
    const rect = wrapper.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(CANVAS_W, (e.clientX - rect.left - 32 - panX) / scale)),
      y: Math.max(0, Math.min(CANVAS_H, (e.clientY - rect.top - 24 - panY) / scale)),
    }
  }

  function isNearPoint(a: CanvasPoint, b: CanvasPoint, threshold = 12): boolean {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) < threshold / scale
  }

  // ── Mouse handlers ────────────────────────────────────────────────
  function handleMouseDown(e: React.MouseEvent) {
    // Added by Claude — reset drag-vs-click tracking for this press
    panMoved.current = false

    // Explicit pan: Space-drag or middle mouse — available in every mode
    if (spacePressed.current || e.button === 1) {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, panX, panY }
      e.preventDefault()
      return
    }

    const p = getSVGPoint(e)
    mouseDownPos.current = p

    // Modes where the left button places things — never pan
    if (mode === 'addFreePlant' || mode === 'addRow') return

    // Drawing: polygon adds points on click; rectangle drags out a box
    if (mode === 'drawing') {
      if (shape === 'rectangle') {
        rectStart.current = p
        isDrawingRect.current = true
      }
      return
    }

    // Complete: dragging an existing vertex takes priority over panning
    if (mode === 'complete') {
      const idx = points.findIndex(pt => isNearPoint(pt, p, 12))
      if (idx !== -1) { isDragging.current = false; dragIndex.current = idx; return }
    }

    // Added by Claude — left-button drag pans the canvas in the viewing modes
    // (setup, or complete on empty space). A press that doesn't move past the
    // threshold is still treated as a click (e.g. selecting a field) — see the
    // panMoved guard in handleMouseMove and the click handlers.
    if (e.button === 0) {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, panX, panY }
      e.preventDefault()
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    // Added by Claude — dragging the selected row translates it (and its plants)
    if (rowDragRef.current && onMoveRow && bbox) {
      // The mouse was released outside the SVG (side panel, rulers, outside
      // the window): no mouseup ever reached us, so end the drag here
      // instead of letting the row chase the cursor on re-entry.
      if (e.buttons === 0) {
        rowDragRef.current = null
        return
      }
      const p = getSVGPoint(e)
      const last = rowDragRef.current.last
      const dLng = ((p.x - last.x) / CANVAS_W) * (bbox.east - bbox.west)
      const dLat = -((p.y - last.y) / CANVAS_H) * (bbox.north - bbox.south)
      if (dLat !== 0 || dLng !== 0) onMoveRow(rowDragRef.current.id, dLat, dLng)
      rowDragRef.current.last = p
      return
    }
    if (isPanning.current && panStart.current) {
      // Added by Claude — once movement passes a small threshold, flag it as a
      // real drag so the click that follows mouseup is ignored by selection.
      if (!panMoved.current) {
        const dx = Math.abs(e.clientX - panStart.current.x)
        const dy = Math.abs(e.clientY - panStart.current.y)
        if (dx > 3 || dy > 3) panMoved.current = true
      }
      setPanX(panStart.current.panX + e.clientX - panStart.current.x)
      setPanY(panStart.current.panY + e.clientY - panStart.current.y)
      return
    }
    const p = getSVGPoint(e)
    if (['drawing', 'addRow', 'addFreePlant'].includes(mode)) onMouseMove(p)
    else onMouseMove(null)
    if (dragIndex.current !== null) {
      const d = mouseDownPos.current
      if (d && (Math.abs(p.x - d.x) > 3 / scale || Math.abs(p.y - d.y) > 3 / scale)) {
        isDragging.current = true
        onMovePoint(dragIndex.current, p)
      }
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (rowDragRef.current) { rowDragRef.current = null; return } // Added by Claude
    if (isPanning.current) { isPanning.current = false; panStart.current = null; return }
    const p = getSVGPoint(e)
    if (isDrawingRect.current && rectStart.current) {
      isDrawingRect.current = false
      const s = rectStart.current
      rectStart.current = null
      if (Math.abs(p.x - s.x) > 10 && Math.abs(p.y - s.y) > 10) onSetRectangle(s, p)
      return
    }
    if (dragIndex.current !== null) {
      if (!isDragging.current) onSelectPoint(dragIndex.current)
      isDragging.current = false
      dragIndex.current = null
      return
    }
    mouseDownPos.current = null
  }

  function handleClick(e: React.MouseEvent) {
    // Added by Claude — ignore the click that concludes a pan-drag
    if (isPanning.current || panMoved.current) return
    const p = getSVGPoint(e)
    if (mode === 'addRow') { onRowClick(p); return }
    if (mode === 'addFreePlant') { if (bbox) onPlaceFreePlant(p, bbox); return }
    if (mode !== 'drawing' || shape === 'rectangle') return
    if (points.length >= 3 && isNearPoint(p, points[0], 14)) { onComplete(); return }
    onAddPoint(p)
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (mode !== 'complete' || shape === 'rectangle') return
    e.stopPropagation()
  }

  // ── Added by Claude — zoom buttons now zoom toward the visible center via
  // applyZoom (previously they scaled about the top-left origin, which shoved
  // the content off-screen). resetZoom keeps the refs in sync too. ──
  function zoomCenter(factor: number) {
    const w = wrapperRef.current
    if (!w) return applyZoom(factor, 0, 0)
    applyZoom(factor, (w.clientWidth - 32) / 2, (w.clientHeight - 24) / 2)
  }
  function zoomIn() { zoomCenter(1.3) }
  function zoomOut() { zoomCenter(1 / 1.3) }
  function resetZoom() {
    scaleRef.current = 1; panXRef.current = 0; panYRef.current = 0
    setScale(1); setPanX(0); setPanY(0)
  }

  // ── Derived SVG strings ───────────────────────────────────────────
  const polygonStr = points.map(p => `${p.x},${p.y}`).join(' ')
  const previewPoints = mousePos && points.length > 0 && mode === 'drawing'
    ? [...points, mousePos] : points
  const previewStr = previewPoints.map(p => `${p.x},${p.y}`).join(' ')
  const rectPreview = isDrawingRect.current && rectStart.current && mousePos
    ? {
        x: Math.min(rectStart.current.x, mousePos.x),
        y: Math.min(rectStart.current.y, mousePos.y),
        w: Math.abs(mousePos.x - rectStart.current.x),
        h: Math.abs(mousePos.y - rectStart.current.y),
      }
    : null

  const cursor = isPanning.current ? 'grabbing'
    : spacePressed.current ? 'grab'
    : mode === 'drawing' || mode === 'addRow' ? 'crosshair'
    : mode === 'addFreePlant' ? 'cell'
    // Added by Claude — viewing modes are draggable to pan, so hint with grab
    : (mode === 'setup' || mode === 'complete') ? 'grab'
    : 'default'

  // ── Measurement badge position (follows mouse) ────────────────────
  // Rendered outside SVG so it's not affected by zoom transform
  const badgeScreenX = mousePos ? mousePos.x * scale + panX + 32 + 12 : 0
  const badgeScreenY = mousePos ? mousePos.y * scale + panY + 24 - 24 : 0

  return (
    <div className="relative w-full h-full overflow-hidden bg-white" ref={wrapperRef}>

      {/* Grid background */}
      <div
        className="absolute pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #e8f0e0 1px, transparent 1px),
                            linear-gradient(to bottom, #e8f0e0 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
          backgroundPosition: `${panX + 32}px ${panY + 24}px`,
          inset: 0,
        }}
      />

      {/* Top ruler */}
      <div className="absolute top-0 left-8 right-0 h-6 bg-[#f5f8f0] border-b border-[#e0e8d8] pointer-events-none z-10 overflow-hidden">
        {canvasScale && Array.from({ length: Math.ceil(CANVAS_W / GRID_SIZE) + 2 }).map((_, i) => (
          <div key={i} className="absolute text-[9px] text-[#9aab8a] font-mono"
            style={{ left: i * GRID_SIZE * scale + panX + 2 }}>
            {Math.round(i * GRID_SIZE * canvasScale.ftPerPixelX)}ft
          </div>
        ))}
      </div>

      {/* Left ruler */}
      <div className="absolute top-6 left-0 w-8 bottom-0 bg-[#f5f8f0] border-r border-[#e0e8d8] pointer-events-none z-10 overflow-hidden">
        {canvasScale && Array.from({ length: Math.ceil(CANVAS_H / GRID_SIZE) + 2 }).map((_, i) => (
          <div key={i} className="absolute text-[9px] text-[#9aab8a] font-mono"
            style={{ top: i * GRID_SIZE * scale + panY + 4, left: 2 }}>
            {Math.round(i * GRID_SIZE * canvasScale.ftPerPixelY)}
          </div>
        ))}
      </div>

      {/* Main SVG */}
      <svg
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute"
        style={{
          top: 24, left: 32, cursor,
          transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >

        {/* Farm boundary fill — subtle tint shows where the farm is */}
        {farmBoundaryCanvas.length >= 3 && (
          <polygon
            points={farmBoundaryStr}
            fill="#eaf3de"
            fillOpacity={0.6}
            stroke="none"
          />
        )}

        {/* Farm boundary outline */}
        {farmBoundaryCanvas.length >= 3 && (
          <g>
            <polygon
              points={farmBoundaryStr}
              fill="none"
              stroke="#2d7a1e"
              strokeWidth={2.5 / scale}
              strokeDasharray={`${10 / scale} ${5 / scale}`}
              opacity={0.85}
            />
            {/* Corner dots on farm boundary */}
            {farmBoundaryCanvas.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3 / scale}
                fill="#2d7a1e" opacity={0.7}
              />
            ))}
            {/* Label at first corner */}
            <text
              x={farmBoundaryCanvas[0].x + 6 / scale}
              y={farmBoundaryCanvas[0].y - 6 / scale}
              fontSize={9 / scale}
              fill="#2d7a1e"
              fontFamily="monospace"
              fontWeight="600"
              opacity={0.9}
            >
              Límite de finca
            </text>
          </g>
        )}

        {/* Rectangle preview with live dimensions */}
        {rectPreview && (
          <g>
            <rect
              x={rectPreview.x} y={rectPreview.y}
              width={rectPreview.w} height={rectPreview.h}
              fill="#8fba4e" fillOpacity={0.15}
              stroke="#639922" strokeWidth={2 / scale}
              strokeDasharray={`${6 / scale} ${4 / scale}`}
            />
            {/* Dimension labels inside rectangle */}
            {measurements?.rectWidthFt && measurements?.rectHeightFt && (
              <>
                {/* Width label — top edge */}
                <text
                  x={rectPreview.x + rectPreview.w / 2}
                  y={rectPreview.y - 6 / scale}
                  textAnchor="middle"
                  fontSize={10 / scale}
                  fill="#2d4a1e"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {formatFt(measurements.rectWidthFt)}
                </text>
                {/* Height label — right edge */}
                <text
                  x={rectPreview.x + rectPreview.w + 6 / scale}
                  y={rectPreview.y + rectPreview.h / 2}
                  textAnchor="start"
                  dominantBaseline="central"
                  fontSize={10 / scale}
                  fill="#2d4a1e"
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {formatFt(measurements.rectHeightFt)}
                </text>
                {/* Area label — center of rectangle */}
                {measurements.rectWidthFt > 20 && measurements.rectHeightFt > 20 && (
                  <text
                    x={rectPreview.x + rectPreview.w / 2}
                    y={rectPreview.y + rectPreview.h / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9 / scale}
                    fill="#639922"
                    fontFamily="monospace"
                    opacity={0.9}
                  >
                    {ft2ToAcres(measurements.rectWidthFt * measurements.rectHeightFt).toFixed(3)} ac
                  </text>
                )}
              </>
            )}
          </g>
        )}

        {/* ── All saved fields — rendered below active field ── */}
        {savedFields.map(field => {
          if (!bbox || !field.boundary || field.boundary.length < 3) return null
          if (field.id === activeFieldId) return null  // skip — drawn separately below

          const isSelected = field.id === selectedFieldId
          const fieldPoints = field.boundary.map(p => latlngToCanvas(p.lat, p.lng, bbox))
          const fieldStr = fieldPoints.map(p => `${p.x},${p.y}`).join(' ')

          return (
            <g key={field.id}
              onClick={(e) => {
                e.stopPropagation()
                if (panMoved.current) return // Added by Claude — ignore click that ended a pan-drag
                if (mode === 'setup') onClickField(field.id)
              }}
              style={{ cursor: mode === 'setup' ? 'pointer' : 'default' }}
            >
              <polygon
                points={fieldStr}
                fill={field.color}
                fillOpacity={isSelected ? 0.45 : 0.25}
                stroke={field.color}
                strokeWidth={isSelected ? 3 / scale : 2 / scale}
                strokeDasharray={isSelected ? undefined : `${6 / scale} ${3 / scale}`}
              />
              {/* Field name label */}
              {fieldPoints.length > 0 && (
                <text
                  x={fieldPoints.reduce((s, p) => s + p.x, 0) / fieldPoints.length}
                  y={fieldPoints.reduce((s, p) => s + p.y, 0) / fieldPoints.length}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10 / scale}
                  fill={field.color}
                  fontFamily="monospace"
                  fontWeight="700"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {field.name}
                </text>
              )}
              {/* Selected highlight ring */}
              {isSelected && (
                <polygon
                  points={fieldStr}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.5 / scale}
                  opacity={0.6}
                />
              )}
            </g>
          )
        })}
        {/* Completed field boundary */}
        {(mode === 'complete' || mode === 'addRow' || mode === 'addFreePlant' || mode === 'fillRows') && points.length >= 3 && (
          <polygon
            points={polygonStr}
            fill="#8fba4e" fillOpacity={0.2}
            stroke="#639922" strokeWidth={2 / scale}
          />
        )}

        {/* Drawing preview polyline */}
        {mode === 'drawing' && shape === 'polygon' && previewPoints.length >= 2 && (
          <polyline
            points={previewStr}
            fill="none" stroke="#639922"
            strokeWidth={2 / scale}
            strokeDasharray={`${6 / scale} ${6 / scale}`}
          />
        )}

        {/* Closing line back to first point */}
        {mode === 'drawing' && shape === 'polygon' && mousePos && points.length >= 2 && (
          <line
            x1={mousePos.x} y1={mousePos.y}
            x2={points[0].x} y2={points[0].y}
            stroke="#639922" strokeWidth={1.5 / scale}
            strokeDasharray={`${4 / scale} ${8 / scale}`}
            opacity={0.4}
          />
        )}

        {/* Edge length labels on completed polygon */}
        {mode === 'complete' && measurements?.edgeLengths.map((edge, i) => {
          // Angle of the edge for label rotation
          const p1 = points[i]
          const p2 = points[(i + 1) % points.length]
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI
          // Offset label slightly perpendicular to edge so it doesn't overlap the line
          const perpAngle = (angle + 90) * Math.PI / 180
          const offsetDist = 12 / scale
          const labelX = edge.mid.x + Math.cos(perpAngle) * offsetDist
          const labelY = edge.mid.y + Math.sin(perpAngle) * offsetDist

          return (
            <g key={i}>
              {/* White background pill for readability */}
              <rect
                x={labelX - 18 / scale}
                y={labelY - 6 / scale}
                width={36 / scale}
                height={12 / scale}
                rx={3 / scale}
                fill="white"
                fillOpacity={0.85}
              />
              <text
                x={labelX} y={labelY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={8 / scale}
                fill="#2d4a1e"
                fontFamily="monospace"
                fontWeight="600"
              >
                {edge.label}
              </text>
            </g>
          )
        })}

        {/* Rows — Added by Claude: click the line to select the whole row,
            click a plant to select just that plant. */}
        {rowsOnCanvas.map(row => {
          const rowSelected = selectedRowId === row.id
          return (
          <g key={row.id}>
            {/* Visible row — closed ring (polygon), open contour run (polyline),
                or a straight row (line). (Added by Claude) */}
            {(() => {
              const stroke = rowSelected ? '#2d4a1e' : '#c0d8a0'
              const strokeWidth = (rowSelected ? 2.5 : 1.5) / scale
              const dash = rowSelected ? undefined : `${4 / scale} ${4 / scale}`
              if (row.pathPx) {
                const pts = row.pathPx.map(p => `${p.x},${p.y}`).join(' ')
                return row.pathClosed
                  ? <polygon points={pts} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
                  : <polyline points={pts} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />
              }
              return (
                <line
                  x1={row.startPx.x} y1={row.startPx.y} x2={row.endPx.x} y2={row.endPx.y}
                  stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash}
                />
              )
            })()}
            {/* Transparent wide hit-area: click to select; drag (once selected)
                to move the whole row. (Added by Claude) */}
            {mode === 'complete' && onSelectRow && (() => {
              const hitProps = {
                stroke: 'transparent',
                strokeWidth: 14 / scale,
                fill: 'none' as const,
                style: { cursor: rowSelected && onMoveRow ? 'move' : 'pointer' },
                onMouseDown: (e: React.MouseEvent) => {
                  if (rowSelected && onMoveRow) {
                    e.stopPropagation() // take over from pan; start a row drag
                    rowDragRef.current = { id: row.id, last: getSVGPoint(e) }
                  }
                },
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation()
                  if (panMoved.current) return
                  onSelectRow(row.id)
                },
              }
              if (row.pathPx) {
                const pts = row.pathPx.map(p => `${p.x},${p.y}`).join(' ')
                return row.pathClosed
                  ? <polygon points={pts} {...hitProps} />
                  : <polyline points={pts} {...hitProps} />
              }
              return <line x1={row.startPx.x} y1={row.startPx.y} x2={row.endPx.x} y2={row.endPx.y} {...hitProps} />
            })()}
            {row.plantsOnCanvas.map(plant => {
              const plantSelected = selectedPlantId === plant.id
              return (
              <g key={plant.id}>
                {plantSelected && (
                  <circle cx={plant.px.x} cy={plant.px.y} r={11 / scale}
                    fill="none" stroke="#2d4a1e" strokeWidth={2 / scale} />
                )}
                {/* Plant hit-area (drawn under the emoji, takes click priority
                    over the row via stopPropagation) */}
                {mode === 'complete' && onSelectPlant && (
                  <circle cx={plant.px.x} cy={plant.px.y} r={10 / scale}
                    fill="transparent" style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (panMoved.current) return
                      onSelectPlant(plant.id)
                    }}
                  />
                )}
                <text
                  x={plant.px.x} y={plant.px.y}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={14 / scale}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {getCropById(plant.cropTypeId)?.emoji ?? '🌱'}
                </text>
              </g>
            )})}
          </g>
        )})}

        {/* ── Added by Claude — fill-tool preview (semi-transparent) ── */}
        {mode === 'fillRows' && fillPreviewOnCanvas.map(row => (
          <g key={row.id} opacity={0.75}>
            {(() => {
              const sw = 2 / scale, dash = `${5 / scale} ${4 / scale}`
              if (row.pathPx) {
                const pts = row.pathPx.map(p => `${p.x},${p.y}`).join(' ')
                return row.pathClosed
                  ? <polygon points={pts} fill="none" stroke="#639922" strokeWidth={sw} strokeDasharray={dash} />
                  : <polyline points={pts} fill="none" stroke="#639922" strokeWidth={sw} strokeDasharray={dash} />
              }
              return (
                <line
                  x1={row.startPx.x} y1={row.startPx.y} x2={row.endPx.x} y2={row.endPx.y}
                  stroke="#639922" strokeWidth={sw} strokeDasharray={dash}
                />
              )
            })()}
            {row.plantsOnCanvas.map(plant => (
              <text key={plant.id}
                x={plant.px.x} y={plant.px.y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={13 / scale} style={{ userSelect: 'none' }}
              >
                {getCropById(plant.cropTypeId)?.emoji ?? '🌱'}
              </text>
            ))}
          </g>
        ))}

        {/* Free plants — Added by Claude: click to select (then edit/delete
            via the plant panel) instead of deleting on click. */}
        {freePlantsOnCanvas.map(plant => {
          const plantSelected = selectedPlantId === plant.id
          return (
          <g key={plant.id}>
            {plantSelected && (
              <circle cx={plant.px.x} cy={plant.px.y} r={11 / scale}
                fill="none" stroke="#2d4a1e" strokeWidth={2 / scale} />
            )}
            <circle cx={plant.px.x} cy={plant.px.y} r={10 / scale}
              fill="transparent" stroke="transparent" strokeWidth={8 / scale}
              style={{ cursor: mode === 'complete' ? 'pointer' : 'default' }}
              onClick={(e) => {
                e.stopPropagation()
                if (panMoved.current) return // ignore click that ended a pan-drag
                if (mode === 'complete' && onSelectPlant) onSelectPlant(plant.id)
              }}
            />
            <text x={plant.px.x} y={plant.px.y}
              textAnchor="middle" dominantBaseline="central"
              fontSize={14 / scale}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {getCropById(plant.cropTypeId)?.emoji ?? '🌱'}
            </text>
          </g>
        )})}

        {/* Row drawing preview */}
        {mode === 'addRow' && rowStartPoint && mousePos && (
          <g>
            <line
              x1={rowStartPoint.x} y1={rowStartPoint.y}
              x2={mousePos.x} y2={mousePos.y}
              stroke="#639922" strokeWidth={2 / scale}
              strokeDasharray={`${6 / scale} ${4 / scale}`} opacity={0.7}
            />
            <circle cx={rowStartPoint.x} cy={rowStartPoint.y} r={5 / scale}
              fill="#639922" stroke="white" strokeWidth={2 / scale}
            />
            {/* Row length badge inside SVG (scales with zoom) */}
            {canvasScale && (
              <g>
                <rect
                  x={(rowStartPoint.x + mousePos.x) / 2 - 20 / scale}
                  y={(rowStartPoint.y + mousePos.y) / 2 - 8 / scale}
                  width={40 / scale} height={14 / scale}
                  rx={3 / scale} fill="#2d4a1e" fillOpacity={0.85}
                />
                <text
                  x={(rowStartPoint.x + mousePos.x) / 2}
                  y={(rowStartPoint.y + mousePos.y) / 2}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={8 / scale} fill="white" fontFamily="monospace"
                >
                  {formatFt(canvasDistanceFt(rowStartPoint, mousePos, canvasScale))}
                </text>
              </g>
            )}
          </g>
        )}

        {/* Free plant placement preview */}
        {mode === 'addFreePlant' && mousePos && selectedFreeCropId && (
          <g>
            <circle cx={mousePos.x} cy={mousePos.y} r={16 / scale}
              fill="#639922" fillOpacity={0.15}
              stroke="#639922" strokeWidth={1.5 / scale}
              strokeDasharray={`${3 / scale} ${3 / scale}`}
            />
            <text x={mousePos.x} y={mousePos.y}
              textAnchor="middle" dominantBaseline="central"
              fontSize={16 / scale} style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {getCropById(selectedFreeCropId)?.emoji ?? '🌱'}
            </text>
          </g>
        )}

        {/* Corner points */}
        {(mode === 'drawing' || mode === 'complete') && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y}
            r={(selectedPointIndex === i ? 9 : i === 0 ? 8 : 6) / scale}
            fill={selectedPointIndex === i ? '#ef4444' : i === 0 ? '#639922' : 'white'}
            stroke={selectedPointIndex === i ? '#ef4444' : '#2d4a1e'}
            strokeWidth={2 / scale}
            style={{ cursor: mode === 'complete' ? 'grab' : 'pointer' }}
          />
        ))}

        {/* Snap ring on first point */}
        {mode === 'drawing' && shape === 'polygon' && points.length >= 3 && mousePos &&
          Math.sqrt((mousePos.x - points[0].x) ** 2 + (mousePos.y - points[0].y) ** 2) < 20 / scale && (
          <circle cx={points[0].x} cy={points[0].y} r={14 / scale}
            fill="none" stroke="#639922" strokeWidth={2 / scale} opacity={0.6}
          />
        )}

      </svg>

      {/* ── Live measurement badge — follows mouse, outside SVG transform ── */}
      {mousePos && measurements !== null && measurements?.currentSegmentFt !== null && mode === 'drawing' && shape === 'polygon' && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{ left: badgeScreenX, top: badgeScreenY }}
        >
          <div className="bg-[#2d4a1e] text-[#d4e8b0] text-[10px] font-mono font-semibold px-2 py-1 rounded-lg shadow-md whitespace-nowrap">
            {formatFt(measurements.currentSegmentFt!)}
          </div>
        </div>
      )}

      {/* ── Measurement info panel — top left ── */}
      {mode === 'drawing' && measurements && (
        <div className="absolute top-8 left-10 z-20 bg-white/90 border border-[#e0e8d8] rounded-lg px-3 py-2 shadow-sm pointer-events-none">
          {shape === 'polygon' ? (
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] text-[#9aab8a] uppercase tracking-wide font-semibold">
                Polígono
              </p>
              <p className="text-xs font-mono font-semibold text-[#2d4a1e]">
                Perímetro: {formatFt(measurements.runningPerimeterFt)}
              </p>
              {points.length >= 2 && (
                <p className="text-[10px] text-[#7a8a6a] font-mono">
                  {points.length} puntos colocados
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] text-[#9aab8a] uppercase tracking-wide font-semibold">
                Rectángulo
              </p>
              {measurements.rectWidthFt && measurements.rectHeightFt ? (
                <>
                  <p className="text-xs font-mono font-semibold text-[#2d4a1e]">
                    {formatFt(measurements.rectWidthFt)} × {formatFt(measurements.rectHeightFt)}
                  </p>
                  <p className="text-[10px] text-[#639922] font-mono">
                    {ft2ToAcres(measurements.rectWidthFt * measurements.rectHeightFt).toFixed(4)} acres
                  </p>
                </>
              ) : (
                <p className="text-[10px] text-[#7a8a6a]">Clic y arrastra para dibujar</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Completed field stats panel ── */}
      {mode === 'complete' && measurements?.totalPerimeterFt && (
        <div className="absolute top-8 left-10 z-20 bg-white/90 border border-[#e0e8d8] rounded-lg px-3 py-2 shadow-sm pointer-events-none">
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] text-[#9aab8a] uppercase tracking-wide font-semibold">
              Campo
            </p>
            <p className="text-xs font-mono font-semibold text-[#2d4a1e]">
              Perímetro: {formatFt(measurements.totalPerimeterFt)}
            </p>
            {measurements.totalAcres && (
              <p className="text-[10px] text-[#639922] font-mono">
                {measurements.totalAcres.toFixed(4)} acres · {Math.round(measurements.totalAreaFt2!).toLocaleString()} ft²
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Crop summary overlay ── */}
      {(rows.length > 0 || freePlants.length > 0) && (
        <CropSummaryOverlay rows={rows} freePlants={freePlants} />
      )}

      {/* ── Zoom controls ── */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1.5">
        <button onClick={zoomIn}
          className="w-8 h-8 bg-white border border-[#e0e8d8] rounded-lg flex items-center justify-center text-[#5a6a4a] hover:bg-[#f5f8f0] transition-colors shadow-sm"
          title="Acercar"
        >
          <ZoomIn size={14} />
        </button>
        <button onClick={zoomOut}
          className="w-8 h-8 bg-white border border-[#e0e8d8] rounded-lg flex items-center justify-center text-[#5a6a4a] hover:bg-[#f5f8f0] transition-colors shadow-sm"
          title="Alejar"
        >
          <ZoomOut size={14} />
        </button>
        <button onClick={resetZoom}
          className="w-8 h-8 bg-white border border-[#e0e8d8] rounded-lg flex items-center justify-center text-[#5a6a4a] hover:bg-[#f5f8f0] transition-colors shadow-sm"
          title="Restablecer vista"
        >
          <Maximize2 size={14} />
        </button>
        <div className="w-8 h-6 bg-white/80 border border-[#e0e8d8] rounded flex items-center justify-center">
          <span className="text-[9px] text-[#9aab8a] font-mono">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      {/* Pan hint */}
      <div className="absolute bottom-4 left-10 z-20">
        <span className="text-[9px] text-[#9aab8a] bg-white/70 px-2 py-1 rounded">
          Arrastrar para mover · Scroll para zoom · Espacio + arrastrar también mueve
        </span>
      </div>

    </div>
  )
}

function CropSummaryOverlay({ rows, freePlants }: { rows: FieldRow[]; freePlants: PlantInstance[] }) {
  const counts: Record<string, { emoji: string; count: number }> = {}
  rows.forEach(r => r.plants.forEach(p => {
    const crop = getCropById(p.cropTypeId)
    if (!counts[p.cropTypeId]) counts[p.cropTypeId] = { emoji: crop?.emoji ?? '🌱', count: 0 }
    counts[p.cropTypeId].count++
  }))
  freePlants.forEach(p => {
    const crop = getCropById(p.cropTypeId)
    if (!counts[p.cropTypeId]) counts[p.cropTypeId] = { emoji: crop?.emoji ?? '🌱', count: 0 }
    counts[p.cropTypeId].count++
  })
  const entries = Object.entries(counts)
  if (entries.length === 0) return null
  return (
    <div className="absolute top-8 right-16 z-10 bg-white/90 border border-[#e0e8d8] rounded-lg px-3 py-2 flex items-center gap-3 shadow-sm pointer-events-none">
      {entries.map(([id, { emoji, count }]) => (
        <div key={id} className="flex items-center gap-1">
          <span className="text-base leading-none">{emoji}</span>
          <span className="text-xs font-semibold text-[#2d4a1e]">{count}</span>
        </div>
      ))}
    </div>
  )
}