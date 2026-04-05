import { useRef, useEffect } from 'react'
import type { FieldPoint, FieldShape, FieldRow, PlantInstance } from '../types'
import { getCropById } from '../data/cropLibrary'

type Props = {
  shape: FieldShape
  mode: string
  points: FieldPoint[]
  mousePos: FieldPoint | null
  selectedPointIndex: number | null
  widthFt: number
  heightFt: number
  rows: FieldRow[]
  freePlants: PlantInstance[]
  rowStartPoint: FieldPoint | null
  selectedFreeCropId: string
  onAddPoint: (p: FieldPoint) => void
  onSetRectangle: (p1: FieldPoint, p2: FieldPoint) => void
  onMovePoint: (index: number, p: FieldPoint) => void
  onSelectPoint: (index: number) => void
  onMouseMove: (p: FieldPoint | null) => void
  onComplete: () => void
  onRowClick: (p: FieldPoint) => void
  onPlaceFreePlant: (p: FieldPoint) => void
  onDeleteFreePlant: (id: string) => void
}

const CANVAS_W = 800
const CANVAS_H = 600
const GRID_SIZE = 40

export default function FieldEditorCanvas({
  shape, mode, points, mousePos, selectedPointIndex,
  widthFt, heightFt, rows, freePlants, rowStartPoint,
  selectedFreeCropId,
  onAddPoint, onSetRectangle, onMovePoint, onSelectPoint,
  onMouseMove, onComplete, onRowClick, onPlaceFreePlant,
  onDeleteFreePlant,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const dragIndex = useRef<number | null>(null)
  const mouseDownPos = useRef<FieldPoint | null>(null)
  const rectStart = useRef<FieldPoint | null>(null)
  const isDrawingRect = useRef(false)
  const rectPreviewRef = useRef<FieldPoint | null>(null)

  function getSVGPoint(e: React.MouseEvent | MouseEvent): FieldPoint {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(CANVAS_W, e.clientX - rect.left)),
      y: Math.max(0, Math.min(CANVAS_H, e.clientY - rect.top)),
    }
  }

  function isNearPoint(a: FieldPoint, b: FieldPoint, threshold = 12): boolean {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) < threshold
  }

  // Keyboard handler
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (mode === 'drawing' && e.key === 'Backspace') {
        onAddPoint({ x: -1, y: -1 }) // signal undo — handled in useFieldEditor
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, onAddPoint])

  function handleMouseDown(e: React.MouseEvent) {
    const p = getSVGPoint(e)
    mouseDownPos.current = p

    if (mode === 'addFreePlant') return
    if (mode === 'addRow') return

    if (mode !== 'drawing' && mode !== 'complete') return

    const pointIndex = points.findIndex(pt => isNearPoint(pt, p, 12))
    if (pointIndex !== -1) {
      isDragging.current = false
      dragIndex.current = pointIndex
      return
    }

    if (shape === 'rectangle' && mode === 'drawing') {
      rectStart.current = p
      isDrawingRect.current = true
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const p = getSVGPoint(e)

    if (mode === 'drawing' || mode === 'addRow' || mode === 'addFreePlant') {
      onMouseMove(p)
    } else {
      onMouseMove(null)
    }

    if (dragIndex.current !== null) {
      const downPos = mouseDownPos.current
      if (downPos && (Math.abs(p.x - downPos.x) > 3 || Math.abs(p.y - downPos.y) > 3)) {
        isDragging.current = true
        onMovePoint(dragIndex.current, p)
      }
      return
    }

    if (isDrawingRect.current) {
      rectPreviewRef.current = p
      onMouseMove(p)
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    const p = getSVGPoint(e)

    if (isDrawingRect.current && rectStart.current) {
      isDrawingRect.current = false
      const start = rectStart.current
      rectStart.current = null
      if (Math.abs(p.x - start.x) > 10 && Math.abs(p.y - start.y) > 10) {
        onSetRectangle(start, p)
      }
      return
    }

    if (dragIndex.current !== null) {
      if (!isDragging.current) {
        onSelectPoint(dragIndex.current)
      }
      isDragging.current = false
      dragIndex.current = null
      return
    }

    mouseDownPos.current = null
  }

  function handleClick(e: React.MouseEvent) {
    const p = getSVGPoint(e)

    if (mode === 'addRow') {
      onRowClick(p)
      return
    }

    if (mode === 'addFreePlant') {
      onPlaceFreePlant(p)
      return
    }

    if (mode !== 'drawing' || shape === 'rectangle') return

    if (points.length >= 3 && isNearPoint(p, points[0], 14)) {
      onComplete()
      return
    }

    onAddPoint(p)
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (mode !== 'complete' || shape === 'rectangle') return
    e.stopPropagation()
  }

  // Build polygon string
  const polygonStr = points.map(p => `${p.x},${p.y}`).join(' ')
  const previewPoints = mousePos && points.length > 0 && mode === 'drawing'
    ? [...points, mousePos]
    : points
  const previewStr = previewPoints.map(p => `${p.x},${p.y}`).join(' ')

  // Rectangle preview
  const rectPreview = isDrawingRect.current && rectStart.current && mousePos
    ? {
        x: Math.min(rectStart.current.x, mousePos.x),
        y: Math.min(rectStart.current.y, mousePos.y),
        w: Math.abs(mousePos.x - rectStart.current.x),
        h: Math.abs(mousePos.y - rectStart.current.y),
      }
    : null

  // Scale ruler labels
  const ftPerGridX = (widthFt / CANVAS_W) * GRID_SIZE
  const ftPerGridY = (heightFt / CANVAS_H) * GRID_SIZE

  // Cursor style
  const cursor = mode === 'drawing' ? 'crosshair'
    : mode === 'addRow' ? 'crosshair'
    : mode === 'addFreePlant' ? 'cell'
    : 'default'

  return (
    <div className="relative w-full h-full overflow-hidden bg-white">

      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #e8f0e0 1px, transparent 1px),
                            linear-gradient(to bottom, #e8f0e0 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          top: 24,
          left: 32,
        }}
      />

      {/* Top ruler */}
      <div className="absolute top-0 left-8 right-0 h-6 bg-[#f5f8f0] border-b border-[#e0e8d8] flex items-center pointer-events-none z-10">
        {Array.from({ length: Math.floor(CANVAS_W / GRID_SIZE) }).map((_, i) => (
          <div key={i} className="absolute text-[9px] text-[#9aab8a] font-mono" style={{ left: i * GRID_SIZE + 2 }}>
            {Math.round(i * ftPerGridX)}ft
          </div>
        ))}
      </div>

      {/* Left ruler */}
      <div className="absolute top-6 left-0 w-8 bottom-0 bg-[#f5f8f0] border-r border-[#e0e8d8] pointer-events-none z-10">
        {Array.from({ length: Math.floor(CANVAS_H / GRID_SIZE) }).map((_, i) => (
          <div key={i} className="absolute text-[9px] text-[#9aab8a] font-mono" style={{ top: i * GRID_SIZE + 4, left: 2 }}>
            {Math.round(i * ftPerGridY)}
          </div>
        ))}
      </div>

      {/* Main SVG canvas */}
      <svg
        ref={svgRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute"
        style={{ top: 24, left: 32, cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >

        {/* Rectangle preview while dragging */}
        {rectPreview && (
          <rect x={rectPreview.x} y={rectPreview.y} width={rectPreview.w} height={rectPreview.h}
            fill="#8fba4e" fillOpacity={0.15} stroke="#639922" strokeWidth={2} strokeDasharray="6 4"
          />
        )}

        {/* Completed boundary */}
        {(mode === 'complete' || mode === 'addRow' || mode === 'addFreePlant') && points.length >= 3 && (
          <polygon points={polygonStr}
            fill="#8fba4e" fillOpacity={0.08}
            stroke="#639922" strokeWidth={2}
          />
        )}

        {/* Drawing preview */}
        {mode === 'drawing' && shape === 'polygon' && previewPoints.length >= 2 && (
          <polyline points={previewStr} fill="none" stroke="#639922" strokeWidth={2} strokeDasharray="6 6" />
        )}

        {/* Closing line */}
        {mode === 'drawing' && shape === 'polygon' && mousePos && points.length >= 2 && (
          <line x1={mousePos.x} y1={mousePos.y} x2={points[0].x} y2={points[0].y}
            stroke="#639922" strokeWidth={1.5} strokeDasharray="4 8" opacity={0.4}
          />
        )}

        {/* ── Rows ── */}
        {rows.map(row => {
          const startPx = { x: row.startX * CANVAS_W, y: row.startY * CANVAS_H }
          const endPx = { x: row.endX * CANVAS_W, y: row.endY * CANVAS_H }
          return (
            <g key={row.id}>
              {/* Row line */}
              <line
                x1={startPx.x} y1={startPx.y}
                x2={endPx.x} y2={endPx.y}
                stroke="#c0d8a0" strokeWidth={1.5} strokeDasharray="4 4"
              />
              {/* Plants along the row */}
              {row.plants.map(plant => {
                const crop = getCropById(plant.cropTypeId)
                const px = plant.x * CANVAS_W
                const py = plant.y * CANVAS_H
                return (
                  <text
                    key={plant.id}
                    x={px} y={py}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={14}
                    style={{ userSelect: 'none', cursor: 'default' }}
                  >
                    {crop?.emoji ?? '🌱'}
                  </text>
                )
              })}
            </g>
          )
        })}

        {/* ── Free plants ── */}
        {freePlants.map(plant => {
          const crop = getCropById(plant.cropTypeId)
          const px = plant.x * CANVAS_W
          const py = plant.y * CANVAS_H
          return (
            <g key={plant.id}>
              <circle cx={px} cy={py} r={10}
                fill="white" fillOpacity={0.01}
                stroke="transparent" strokeWidth={8}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (mode === 'complete') onDeleteFreePlant(plant.id)
                }}
              />
              <text
                x={px} y={py}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={14}
                style={{ userSelect: 'none', cursor: mode === 'complete' ? 'pointer' : 'default' }}
              >
                {crop?.emoji ?? '🌱'}
              </text>
            </g>
          )
        })}

        {/* ── Row drawing preview ── */}
        {mode === 'addRow' && rowStartPoint && mousePos && (
          <>
            <line
              x1={rowStartPoint.x} y1={rowStartPoint.y}
              x2={mousePos.x} y2={mousePos.y}
              stroke="#639922" strokeWidth={2} strokeDasharray="6 4" opacity={0.7}
            />
            <circle cx={rowStartPoint.x} cy={rowStartPoint.y} r={5}
              fill="#639922" stroke="white" strokeWidth={2}
            />
          </>
        )}

        {/* ── Free plant placement preview ── */}
        {mode === 'addFreePlant' && mousePos && selectedFreeCropId && (
          <>
            <circle cx={mousePos.x} cy={mousePos.y} r={16}
              fill="#639922" fillOpacity={0.15}
              stroke="#639922" strokeWidth={1.5} strokeDasharray="3 3"
            />
            <text
              x={mousePos.x} y={mousePos.y}
              textAnchor="middle" dominantBaseline="central"
              fontSize={16} style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {getCropById(selectedFreeCropId)?.emoji ?? '🌱'}
            </text>
          </>
        )}

        {/* ── Boundary corner points ── */}
        {(mode === 'drawing' || mode === 'complete') &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={p.x} cy={p.y}
              r={selectedPointIndex === i ? 9 : i === 0 ? 8 : 6}
              fill={selectedPointIndex === i ? '#ef4444' : i === 0 ? '#639922' : 'white'}
              stroke={selectedPointIndex === i ? '#ef4444' : '#2d4a1e'}
              strokeWidth={2}
              style={{ cursor: mode === 'complete' ? 'grab' : 'pointer' }}
            />
          ))
        }

        {/* First point snap ring */}
        {mode === 'drawing' && shape === 'polygon' && points.length >= 3 && mousePos &&
          isNearPoint(mousePos, points[0], 20) && (
          <circle cx={points[0].x} cy={points[0].y} r={14}
            fill="none" stroke="#639922" strokeWidth={2} opacity={0.6}
          />
        )}

      </svg>

      {/* Crop summary overlay — top right of canvas */}
      {(mode === 'complete' || mode === 'addRow' || mode === 'addFreePlant') && (
        rows.length > 0 || freePlants.length > 0
      ) && (
        <CropSummaryOverlay rows={rows} freePlants={freePlants} />
      )}

    </div>
  )
}

// ── Crop summary overlay ───────────────────────────────────────────────
function CropSummaryOverlay({
  rows, freePlants
}: {
  rows: FieldRow[]
  freePlants: PlantInstance[]
}) {
  const counts: Record<string, { emoji: string; count: number }> = {}

  rows.forEach(row => row.plants.forEach(p => {
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
    <div className="absolute top-8 right-4 z-10 bg-white/90 border border-[#e0e8d8] rounded-lg px-3 py-2 flex items-center gap-3 shadow-sm pointer-events-none">
      {entries.map(([id, { emoji, count }]) => (
        <div key={id} className="flex items-center gap-1">
          <span className="text-base leading-none">{emoji}</span>
          <span className="text-xs font-semibold text-[#2d4a1e]">{count}</span>
        </div>
      ))}
    </div>
  )
}

function isNearPoint(a: FieldPoint, b: FieldPoint, threshold = 12): boolean {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) < threshold
}