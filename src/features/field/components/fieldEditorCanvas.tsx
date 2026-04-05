import { useRef, useEffect, useCallback } from 'react'
import type { FieldPoint, FieldShape } from '../types'

type Props = {
  shape: FieldShape
  mode: string
  points: FieldPoint[]
  mousePos: FieldPoint | null
  selectedPointIndex: number | null
  widthFt: number
  heightFt: number
  onAddPoint: (p: FieldPoint) => void
  onSetRectangle: (p1: FieldPoint, p2: FieldPoint) => void
  onMovePoint: (index: number, p: FieldPoint) => void
  onSelectPoint: (index: number) => void
  onMouseMove: (p: FieldPoint | null) => void
  onComplete: () => void
}

// Canvas dimensions in pixels
const CANVAS_W = 800
const CANVAS_H = 600
const GRID_SIZE = 40  // pixels per grid cell

export default function FieldEditorCanvas({
  shape, mode, points, mousePos, selectedPointIndex,
  widthFt, heightFt,
  onAddPoint, onSetRectangle, onMovePoint,
  onSelectPoint, onMouseMove, onComplete,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const dragIndex = useRef<number | null>(null)
  const mouseDownPos = useRef<FieldPoint | null>(null)
  const rectStart = useRef<FieldPoint | null>(null)
  const isDrawingRect = useRef(false)

  // Convert pixel coordinates to feet label
  const pxToFt = useCallback((px: number, axis: 'x' | 'y') => {
    const total = axis === 'x' ? widthFt : heightFt
    return Math.round((px / CANVAS_W) * total * 10) / 10
  }, [widthFt, heightFt])

  function getSVGPoint(e: React.MouseEvent | MouseEvent): FieldPoint {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(CANVAS_W, e.clientX - rect.left)),
      y: Math.max(0, Math.min(CANVAS_H, e.clientY - rect.top)),
    }
  }

  function isNearPoint(a: FieldPoint, b: FieldPoint, threshold = 10): boolean {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) < threshold
  }

  function findNearestEdge(p: FieldPoint): number {
    let nearest = 0
    let nearestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lenSq = dx * dx + dy * dy
      let t = lenSq !== 0
        ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
        : 0
      const cx = a.x + t * dx
      const cy = a.y + t * dy
      const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)
      if (dist < nearestDist) { nearestDist = dist; nearest = i }
    }
    return nearest
  }

  // Keyboard handler
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (mode === 'drawing' && e.key === 'Backspace') {
        // handled by parent via undoLastPoint
      }
      if (mode === 'complete' || mode === 'drawing') {
        if (e.key === 'Escape') onSelectPoint(-1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, onSelectPoint])

  function handleMouseDown(e: React.MouseEvent) {
    const p = getSVGPoint(e)
    mouseDownPos.current = p

    if (mode !== 'drawing' && mode !== 'complete') return

    // Check if clicking on an existing point
    const pointIndex = points.findIndex(pt => isNearPoint(pt, p, 12))
    if (pointIndex !== -1) {
      isDragging.current = false
      dragIndex.current = pointIndex
      return
    }

    // Rectangle: start drag to draw
    if (shape === 'rectangle' && mode === 'drawing') {
      rectStart.current = p
      isDrawingRect.current = true
      return
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const p = getSVGPoint(e)
    onMouseMove(mode === 'drawing' ? p : null)

    if (dragIndex.current !== null) {
      const downPos = mouseDownPos.current
      if (downPos && (Math.abs(p.x - downPos.x) > 3 || Math.abs(p.y - downPos.y) > 3)) {
        isDragging.current = true
        onMovePoint(dragIndex.current, p)
      }
      return
    }

    if (isDrawingRect.current && rectStart.current) {
      onMouseMove(p)
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    const p = getSVGPoint(e)

    // Finish rectangle drag
    if (isDrawingRect.current && rectStart.current) {
      isDrawingRect.current = false
      const start = rectStart.current
      rectStart.current = null
      if (Math.abs(p.x - start.x) > 10 && Math.abs(p.y - start.y) > 10) {
        onSetRectangle(start, p)
      }
      return
    }

    // Finish point drag
    if (dragIndex.current !== null) {
      if (!isDragging.current) {
        // It was a click not a drag — select the point
        onSelectPoint(dragIndex.current)
      }
      isDragging.current = false
      dragIndex.current = null
      return
    }

    mouseDownPos.current = null
  }

  function handleClick(e: React.MouseEvent) {
    if (mode !== 'drawing' || shape === 'rectangle') return
    const p = getSVGPoint(e)

    // Close polygon if clicking near first point
    if (points.length >= 3 && isNearPoint(p, points[0], 14)) {
      onComplete()
      return
    }

    onAddPoint(p)
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (mode !== 'complete' || shape === 'rectangle') return
    e.stopPropagation()
    const p = getSVGPoint(e)
    const edgeIndex = findNearestEdge(p)
    // Insert point after nearest edge
    const newPoints = [...points]
    newPoints.splice(edgeIndex + 1, 0, p)
    // Rebuild via parent — we call movePoint with a fake "insert"
    // handled by passing new points array up
    onMovePoint(-1, { x: edgeIndex, y: 0 }) // signal to insert
  }

  const polygonStr = points.map(p => `${p.x},${p.y}`).join(' ')
  const previewPoints = mousePos && points.length > 0 && mode === 'drawing'
    ? [...points, mousePos]
    : points
  const previewStr = previewPoints.map(p => `${p.x},${p.y}`).join(' ')

  // Rectangle preview while dragging
  const rectPreview = isDrawingRect.current && rectStart.current && mousePos
    ? {
      x: Math.min(rectStart.current.x, mousePos.x),
      y: Math.min(rectStart.current.y, mousePos.y),
      w: Math.abs(mousePos.x - rectStart.current.x),
      h: Math.abs(mousePos.y - rectStart.current.y),
    }
    : null

  // Scale labels
  const ftPerGridX = (widthFt / CANVAS_W) * GRID_SIZE
  const ftPerGridY = (heightFt / CANVAS_H) * GRID_SIZE

  return (
    <div className="relative w-full h-full overflow-hidden bg-white">

      {/* Grid background */}
      <svg
        width="100%"
        height="100%"
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `linear-gradient(to right, #e8f0e0 1px, transparent 1px), linear-gradient(to bottom, #e8f0e0 1px, transparent 1px)`, backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px` }}
      />

      {/* Scale ruler — top */}
      <div className="absolute top-0 left-0 right-0 h-6 bg-[#f5f8f0] border-b border-[#e0e8d8] flex items-center pointer-events-none z-10">
        {Array.from({ length: Math.floor(CANVAS_W / GRID_SIZE) }).map((_, i) => (
          <div
            key={i}
            className="absolute text-[9px] text-[#9aab8a] font-mono"
            style={{ left: i * GRID_SIZE + 2 }}
          >
            {Math.round(i * ftPerGridX)}ft
          </div>
        ))}
      </div>

      {/* Scale ruler — left */}
      <div className="absolute top-6 left-0 w-8 bottom-0 bg-[#f5f8f0] border-r border-[#e0e8d8] flex flex-col pointer-events-none z-10">
        {Array.from({ length: Math.floor(CANVAS_H / GRID_SIZE) }).map((_, i) => (
          <div
            key={i}
            className="absolute text-[9px] text-[#9aab8a] font-mono"
            style={{ top: i * GRID_SIZE + 28, left: 2 }}
          >
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
        style={{
          top: 24,
          left: 32,
          cursor: mode === 'drawing'
            ? (shape === 'rectangle' ? 'crosshair' : 'crosshair')
            : 'default',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Rectangle preview while dragging */}
        {rectPreview && (
          <rect
            x={rectPreview.x}
            y={rectPreview.y}
            width={rectPreview.w}
            height={rectPreview.h}
            fill="#8fba4e"
            fillOpacity={0.15}
            stroke="#639922"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}

        {/* Completed polygon / rectangle fill */}
        {mode === 'complete' && points.length >= 3 && (
          <polygon
            points={polygonStr}
            fill="#8fba4e"
            fillOpacity={0.2}
            stroke="#639922"
            strokeWidth={2.5}
          />
        )}

        {/* Live preview polyline while drawing polygon */}
        {mode === 'drawing' && shape === 'polygon' && previewPoints.length >= 2 && (
          <polyline
            points={previewStr}
            fill="none"
            stroke="#639922"
            strokeWidth={2}
            strokeDasharray="6 6"
          />
        )}

        {/* Closing line back to first point */}
        {mode === 'drawing' && shape === 'polygon' && mousePos && points.length >= 2 && (
          <line
            x1={mousePos.x} y1={mousePos.y}
            x2={points[0].x} y2={points[0].y}
            stroke="#639922"
            strokeWidth={1.5}
            strokeDasharray="4 8"
            opacity={0.4}
          />
        )}

        {/* Corner points */}
        {(mode === 'drawing' || mode === 'complete') && points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x} cy={p.y}
              r={selectedPointIndex === i ? 9 : i === 0 ? 8 : 6}
              fill={selectedPointIndex === i ? '#ef4444' : i === 0 ? '#639922' : 'white'}
              stroke={selectedPointIndex === i ? '#ef4444' : '#2d4a1e'}
              strokeWidth={2}
              style={{ cursor: mode === 'complete' ? 'grab' : 'pointer' }}
            />
            {/* Dimension labels on rectangle corners */}
            {mode === 'complete' && shape === 'rectangle' && i === 1 && (
              <text x={p.x - 20} y={p.y - 10} fontSize={10} fill="#639922" fontFamily="monospace">
                {widthFt}ft
              </text>
            )}
            {mode === 'complete' && shape === 'rectangle' && i === 2 && (
              <text x={p.x + 6} y={p.y - 20} fontSize={10} fill="#639922" fontFamily="monospace">
                {heightFt}ft
              </text>
            )}
          </g>
        ))}

        {/* First point snap indicator */}
        {mode === 'drawing' && shape === 'polygon' && points.length >= 3 && mousePos &&
          Math.sqrt((mousePos.x - points[0].x) ** 2 + (mousePos.y - points[0].y) ** 2) < 20 && (
          <circle
            cx={points[0].x} cy={points[0].y}
            r={14}
            fill="none"
            stroke="#639922"
            strokeWidth={2}
            opacity={0.6}
          />
        )}
      </svg>
    </div>
  )
}