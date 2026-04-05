import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, useMapEvents, Polygon, Polyline, CircleMarker } from 'react-leaflet'
import * as L from 'leaflet'
import { useDrawing, findNearestEdgeIndex } from '../hooks/useDrawing'
import DrawingPanel from './drawingPanel'
import { useFieldStore } from '@/store/useFieldStore'
import FieldEditor from '@/features/field/components/fieldEditor'
import PlacedField from '@/features/field/components/placedField'
import FieldListDrawer from '@/features/field/components/fieldListDrawer'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const PR_CENTER: [number, number] = [18.2208, -66.5901]
const DEFAULT_ZOOM = 9

// ─── Draggable point marker ───────────────────────────────────────────
// Handles drag, click-to-select, and visual selected state
function DraggablePoint({
  position,
  index,
  isFirst,
  isSelected,
  mode,
  onMove,
  onSelect,
  onClosePolygon,
}: {
  position: L.LatLng
  index: number
  isFirst: boolean
  isSelected: boolean
  mode: string
  onMove: (index: number, latlng: L.LatLng) => void
  onSelect: (index: number) => void
  onClosePolygon: () => void
}) {
  const markerRef = useRef<L.CircleMarker>(null)
  const isDragging = useRef(false)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)
  const map = useMapEvents({})

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return

    const el = marker.getElement() as HTMLElement | undefined
      if (!el) return
      
      const safeEl = el!

    // Change cursor on hover
    safeEl.style.cursor = mode === 'editing' ? 'grab' : 'pointer'

    function onMouseDown(e: MouseEvent) {
      e.stopPropagation()
      mouseDownPos.current = { x: e.clientX, y: e.clientY }
      isDragging.current = false

      // Disable map dragging while we might be dragging a point
      map.dragging.disable()

      function onMouseMove(e: MouseEvent) {
        if (!mouseDownPos.current) return
        const dx = Math.abs(e.clientX - mouseDownPos.current.x)
        const dy = Math.abs(e.clientY - mouseDownPos.current.y)

        // Only consider it a drag after 4px of movement
        if (dx > 4 || dy > 4) {
          isDragging.current = true
          safeEl.style.cursor = 'grabbing'

          const containerPoint = map.mouseEventToContainerPoint(e as any)
          const latlng = map.containerPointToLatLng(containerPoint)
          onMove(index, latlng)
        }
      }

      function onMouseUp(e: MouseEvent) {
        map.dragging.enable()
        safeEl.style.cursor = mode === 'editing' ? 'grab' : 'pointer'
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)

        // If barely moved — treat as a click
        if (!isDragging.current) {
          if (mode === 'drawing' && isFirst) {
            onClosePolygon()
          } else if (mode === 'editing') {
            onSelect(index)
          }
        }

        isDragging.current = false
        mouseDownPos.current = null
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    safeEl.addEventListener('mousedown', onMouseDown)
    return () => {
      safeEl.removeEventListener('mousedown', onMouseDown)
    }
  }, [index, isFirst, mode, map, onMove, onSelect, onClosePolygon])

  // Visual style based on state
  const radius = isFirst ? 8 : isSelected ? 8 : 6
  const fillColor = isSelected
    ? '#ef4444'         // red when selected for deletion
    : isFirst
    ? '#639922'         // green for first point
    : 'white'
  const strokeColor = isSelected ? '#ef4444' : '#2d4a1e'
  const strokeWidth = isSelected ? 2.5 : 2

  return (
    <CircleMarker
      ref={markerRef}
      center={position}
      radius={radius}
      pathOptions={{
        color: strokeColor,
        fillColor,
        fillOpacity: 1,
        weight: strokeWidth,
      }}
    />
  )
}

function FieldPlacementLayer({
  active,
  onPlace,
}: {
  active: boolean
  onPlace: (lat: number, lng: number) => void
}) {
  const map = useMapEvents({
    dblclick(e) {
      if (!active) return
      L.DomEvent.stopPropagation(e)
      onPlace(e.latlng.lat, e.latlng.lng)
    },
  })

  useEffect(() => {
    const container = map.getContainer()
    if (active) container.style.cursor = 'cell'
    else container.style.cursor = ''
    return () => { container.style.cursor = '' }
  }, [active, map])

  return null
}

// ─── The main drawing/editing layer ──────────────────────────────────
function DrawingLayer({
  mode,
  points,
  selectedPointIndex,
  onAddPoint,
  onComplete,
  onMovePoint,
  onSelectPoint,
  onInsertPoint,
}: {
  mode: string
  points: L.LatLng[]
  selectedPointIndex: number | null
  onAddPoint: (latlng: L.LatLng) => void
  onComplete: (points: L.LatLng[]) => void
  onMovePoint: (index: number, latlng: L.LatLng) => void
  onSelectPoint: (index: number) => void
  onInsertPoint: (afterIndex: number, latlng: L.LatLng) => void
}) {
  const [mousePos, setMousePos] = useState<L.LatLng | null>(null)

  const map = useMapEvents({
    click(e) {
      if (mode !== 'drawing') return

      // Close polygon if clicking near first point
      if (points.length >= 3) {
        const distance = map.distance(points[0], e.latlng)
        if (distance < 20) {
          onComplete(points)
          return
        }
      }

      onAddPoint(e.latlng)
    },

    dblclick(e) {
      // Prevent map zoom on double click
      L.DomEvent.stopPropagation(e.originalEvent)
      L.DomEvent.preventDefault(e.originalEvent)

      if (mode !== 'editing' || points.length < 3) return

      // Find nearest edge and insert point there
      const nearestEdge = findNearestEdgeIndex(e.latlng, points, map)
      onInsertPoint(nearestEdge, e.latlng)
    },

    mousemove(e) {
      if (mode === 'drawing') setMousePos(e.latlng)
      else setMousePos(null)
    },
  })

  // Cursor management
  useEffect(() => {
    const container = map.getContainer()
    if (mode === 'drawing') container.style.cursor = 'crosshair'
    else if (mode === 'editing') container.style.cursor = 'default'
    else container.style.cursor = ''
    return () => { container.style.cursor = '' }
  }, [mode, map])

  const handleClosePolygon = useCallback(() => {
    onComplete(points)
  }, [points, onComplete])

  const previewPoints = mousePos && points.length > 0
    ? [...points, mousePos]
    : points

  return (
    <>
      {/* ── Completed polygon ── */}
      {(mode === 'complete' || mode === 'editing') && points.length >= 3 && (
        <Polygon
          positions={points}
          pathOptions={{
            color: '#639922',
            fillColor: '#639922',
            fillOpacity: mode === 'editing' ? 0.08 : 0.15,
            weight: mode === 'editing' ? 2 : 2.5,
            dashArray: mode === 'editing' ? '6 4' : undefined,
          }}
        />
      )}

      {/* ── Live preview line while drawing ── */}
      {mode === 'drawing' && previewPoints.length >= 2 && (
        <Polyline
          positions={previewPoints}
          pathOptions={{ color: '#639922', weight: 2, dashArray: '6 6', opacity: 0.8 }}
        />
      )}

      {/* ── Closing line preview (back to first point) ── */}
      {mode === 'drawing' && mousePos && points.length >= 2 && (
        <Polyline
          positions={[mousePos, points[0]]}
          pathOptions={{ color: '#639922', weight: 1.5, dashArray: '4 8', opacity: 0.4 }}
        />
      )}

      {/* ── Corner point markers ── */}
      {(mode === 'drawing' || mode === 'complete' || mode === 'editing') &&
        points.map((point, i) => (
          <DraggablePoint
            key={i}
            position={point}
            index={i}
            isFirst={i === 0}
            isSelected={selectedPointIndex === i}
            mode={mode}
            onMove={onMovePoint}
            onSelect={onSelectPoint}
            onClosePolygon={handleClosePolygon}
          />
        ))
      }
    </>
  )
}

// ─── Main FarmMap component ───────────────────────────────────────────
type Props = {
  center?: [number, number]
  zoom?: number
}

export default function FarmMap({ center = PR_CENTER, zoom = DEFAULT_ZOOM }: Props) {
  const [showFieldEditor, setShowFieldEditor] = useState(false)
  const [fieldEditorPos, setFieldEditorPos] = useState<{ lat: number; lng: number } | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [placingField, setPlacingField] = useState(false)
  const { fields } = useFieldStore()
  const drawing = useDrawing()
    
  function handleAddField() {
    setPlacingField(true)
  }

  function handleEditField(fieldId: string) {
    setEditingFieldId(fieldId)
    setShowFieldEditor(true)
  }

  function handleSave() {
    console.log('Saving farm boundary:', drawing.points)
    alert('¡Finca guardada! (conectar al backend próximamente)')
  }

  return (
    <div className="flex-1 w-full h-full relative">
      <DrawingPanel
        mode={drawing.mode}
        pointCount={drawing.points.length}
        areaAcres={drawing.areaAcres}
        selectedPointIndex={drawing.selectedPointIndex}
        onStart={drawing.startDrawing}
        onComplete={() => drawing.completeDrawing(drawing.points)}
        onClear={drawing.clearDrawing}
        onStartEditing={drawing.startEditing}
        onFinishEditing={drawing.finishEditing}
        onSave={handleSave}
        onAddField={handleAddField}    // ← add this
        />
      <FieldListDrawer
        onEditField={(fieldId) => {
            setEditingFieldId(fieldId)
            setFieldEditorPos({
            lat: fields.find(f => f.id === fieldId)?.farmLat ?? PR_CENTER[0],
            lng: fields.find(f => f.id === fieldId)?.farmLng ?? PR_CENTER[1],
            })
            setShowFieldEditor(true)
        }}
      />
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        zoomControl={false}
        scrollWheelZoom={true}
        doubleClickZoom={false}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri"
          maxZoom={19}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution=""
          maxZoom={19}
        />
        <DrawingLayer
          mode={drawing.mode}
          points={drawing.points}
          selectedPointIndex={drawing.selectedPointIndex}
          onAddPoint={drawing.addPoint}
          onComplete={drawing.completeDrawing}
          onMovePoint={drawing.movePoint}
          onSelectPoint={drawing.selectPoint}
          onInsertPoint={drawing.insertPointAfter}
              />
              {/* Placed fields */}
        {fields.map(field => (
        <PlacedField
            key={field.id}
            field={field}
            onEdit={handleEditField}
        />
        ))}

        {/* Field placement layer */}
        <FieldPlacementLayer
        active={placingField}
        onPlace={(lat, lng) => {
            setFieldEditorPos({ lat, lng })
            setPlacingField(false)
            setShowFieldEditor(true)
        }}
        />
          </MapContainer>
          {/* Field editor full screen overlay */}
        {showFieldEditor && fieldEditorPos && (
        <FieldEditor
            farmLat={fieldEditorPos.lat}
            farmLng={fieldEditorPos.lng}
            editingFieldId={editingFieldId}
            onClose={() => {
            setShowFieldEditor(false)
            setEditingFieldId(null)
            }}
        />
        )}

        {/* Placing field instruction overlay */}
        {placingField && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-[#2d4a1e] text-[#d4e8b0] px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg">
            Haz doble clic dentro de tu finca para ubicar el campo
        </div>
        )}
    </div>
  )
}