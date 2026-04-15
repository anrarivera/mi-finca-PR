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
  onDeleteFreePlant: (id: string) => void
  onClickField: (id: string) => void
}

export default function FieldEditorCanvas({
  shape, mode, points, mousePos, selectedPointIndex,
  widthFt, heightFt, rows, freePlants, rowStartPoint,
  selectedFreeCropId, bbox, farmBoundary,
  savedFields, activeFieldId, selectedFieldId,
  onAddPoint, onSetRectangle, onMovePoint, onSelectPoint,
  onMouseMove, onComplete, onRowClick, onPlaceFreePlant,
  onDeleteFreePlant, onClickField
}: Props) {
  const [scale, setScale] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const isPanning = useRef(false)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const spacePressed = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragIndex = useRef<number | null>(null)
  const mouseDownPos = useRef<CanvasPoint | null>(null)
  const rectStart = useRef<CanvasPoint | null>(null)
  const isDrawingRect = useRef(false)

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
      setScale(prev => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * (e.deltaY > 0 ? 0.9 : 1.1)))
        setPanX(px => px - mouseX * (next - prev) / prev)
        setPanY(py => py - mouseY * (next - prev) / prev)
        return next
      })
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', onWheel)
  }, [])

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
    if (spacePressed.current || e.button === 1) {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, panX, panY }
      e.preventDefault()
      return
    }
    const p = getSVGPoint(e)
    mouseDownPos.current = p
    if (mode === 'addFreePlant' || mode === 'addRow') return
    if (mode !== 'drawing' && mode !== 'complete') return
    const idx = points.findIndex(pt => isNearPoint(pt, p, 12))
    if (idx !== -1) { isDragging.current = false; dragIndex.current = idx; return }
    if (shape === 'rectangle' && mode === 'drawing') {
      rectStart.current = p
      isDrawingRect.current = true
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isPanning.current && panStart.current) {
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
    if (isPanning.current) return
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

  function zoomIn() { setScale(p => Math.min(MAX_SCALE, p * 1.3)) }
  function zoomOut() { setScale(p => Math.max(MIN_SCALE, p / 1.3)) }
  function resetZoom() { setScale(1); setPanX(0); setPanY(0) }

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
        {(mode === 'complete' || mode === 'addRow' || mode === 'addFreePlant') && points.length >= 3 && (
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

        {/* Rows */}
        {rowsOnCanvas.map(row => (
          <g key={row.id}>
            <line
              x1={row.startPx.x} y1={row.startPx.y}
              x2={row.endPx.x} y2={row.endPx.y}
              stroke="#c0d8a0" strokeWidth={1.5 / scale}
              strokeDasharray={`${4 / scale} ${4 / scale}`}
            />
            {row.plantsOnCanvas.map(plant => (
              <text key={plant.id}
                x={plant.px.x} y={plant.px.y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={14 / scale} style={{ userSelect: 'none' }}
              >
                {getCropById(plant.cropTypeId)?.emoji ?? '🌱'}
              </text>
            ))}
          </g>
        ))}

        {/* Free plants */}
        {freePlantsOnCanvas.map(plant => (
          <g key={plant.id}>
            <circle cx={plant.px.x} cy={plant.px.y} r={10 / scale}
              fill="transparent" stroke="transparent" strokeWidth={8 / scale}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                if (mode === 'complete') onDeleteFreePlant(plant.id)
              }}
            />
            <text x={plant.px.x} y={plant.px.y}
              textAnchor="middle" dominantBaseline="central"
              fontSize={14 / scale}
              style={{ userSelect: 'none', cursor: mode === 'complete' ? 'pointer' : 'default' }}
            >
              {getCropById(plant.cropTypeId)?.emoji ?? '🌱'}
            </text>
          </g>
        ))}

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
          Scroll para zoom · Espacio + arrastrar para mover
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