import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, useMapEvents, Polygon, Polyline, CircleMarker } from 'react-leaflet'
import * as L from 'leaflet'
import { useDrawing, findNearestEdgeIndex } from '../hooks/useDrawing'
import DrawingPanel from './drawingPanel'
import FieldListDrawer from '@/features/field/components/fieldListDrawer'
import FieldEditor from '@/features/field/components/fieldEditor'
import PlacedField from '@/features/field/components/placedField'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore } from '@/store/useFarmStore'
import { isPointInPolygon, boundaryToLatLngs } from '@/features/field/utils/geoUtils'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const PR_CENTER: [number, number] = [18.2208, -66.5901]
const DEFAULT_ZOOM = 9

// ─── Draggable point marker ───────────────────────────────────────────
function DraggablePoint({
  position, index, isFirst, isSelected, mode,
  onMove, onSelect, onClosePolygon,
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
  const markerRef = useState<L.CircleMarker | null>(null)
  const isDragging = { current: false }
  const mouseDownPos = { current: null as { x: number; y: number } | null }
  const map = useMapEvents({})

  useEffect(() => {
    const marker = markerRef[0]
    if (!marker) return
    const safeEl = marker.getElement() as HTMLElement | undefined
    if (!safeEl) return

    safeEl.style.cursor = mode === 'editing' ? 'grab' : 'pointer'

    function onMouseDown(e: MouseEvent) {
      e.stopPropagation()
      mouseDownPos.current = { x: e.clientX, y: e.clientY }
      isDragging.current = false
      map.dragging.disable()
      //Ejemplo de un cambio

      function onMouseMove(e: MouseEvent) {
        if (!mouseDownPos.current) return
        const dx = Math.abs(e.clientX - mouseDownPos.current.x)
        const dy = Math.abs(e.clientY - mouseDownPos.current.y)
        if (dx > 4 || dy > 4) {
          isDragging.current = true
          safeEl.style.cursor = 'grabbing'
          const containerPoint = map.mouseEventToContainerPoint(e as any)
          const latlng = map.containerPointToLatLng(containerPoint)
          onMove(index, latlng)
        }
      }

      function onMouseUp() {
        map.dragging.enable()
        safeEl.style.cursor = mode === 'editing' ? 'grab' : 'pointer'
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        if (!isDragging.current) {
          if (mode === 'drawing' && isFirst) onClosePolygon()
          else if (mode === 'editing') onSelect(index)
        }
        isDragging.current = false
        mouseDownPos.current = null
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    safeEl.addEventListener('mousedown', onMouseDown)
    return () => safeEl.removeEventListener('mousedown', onMouseDown)
  }, [index, isFirst, mode, map, onMove, onSelect, onClosePolygon])

  const radius = isFirst ? 8 : isSelected ? 8 : 6
  const fillColor = isSelected ? '#ef4444' : isFirst ? '#639922' : 'white'
  const strokeColor = isSelected ? '#ef4444' : '#2d4a1e'

  return (
    <CircleMarker
      ref={(r) => { (markerRef as any)[0] = r }}
      center={position}
      radius={radius}
      pathOptions={{ color: strokeColor, fillColor, fillOpacity: 1, weight: 2 }}
    />
  )
}

// ─── Drawing layer ────────────────────────────────────────────────────
function DrawingLayer({
  mode, points, selectedPointIndex,
  onAddPoint, onComplete, onMovePoint, onSelectPoint, onInsertPoint,
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
      if (points.length >= 3) {
        const distance = map.distance(points[0], e.latlng)
        if (distance < 20) { onComplete(points); return }
      }
      onAddPoint(e.latlng)
    },
    dblclick(e) {
      L.DomEvent.stopPropagation(e)
      L.DomEvent.preventDefault(e)
      if (mode !== 'editing' || points.length < 3) return
      const nearestEdge = findNearestEdgeIndex(e.latlng, points, map)
      onInsertPoint(nearestEdge, e.latlng)
    },
    mousemove(e) {
      if (mode === 'drawing') setMousePos(e.latlng)
      else setMousePos(null)
    },
  })

  useEffect(() => {
    const container = map.getContainer()
    if (mode === 'drawing') container.style.cursor = 'crosshair'
    else if (mode === 'editing') container.style.cursor = 'default'
    else container.style.cursor = ''
    return () => { container.style.cursor = '' }
  }, [mode, map])

  const handleClosePolygon = () => onComplete(points)
  const previewPoints = mousePos && points.length > 0 ? [...points, mousePos] : points

  return (
    <>
      {(mode === 'complete' || mode === 'editing') && points.length >= 3 && (
        <Polygon
          positions={points}
          pathOptions={{
            color: '#639922', fillColor: '#639922',
            fillOpacity: mode === 'editing' ? 0.08 : 0.15,
            weight: mode === 'editing' ? 2 : 2.5,
            dashArray: mode === 'editing' ? '6 4' : undefined,
          }}
        />
      )}
      {mode === 'drawing' && previewPoints.length >= 2 && (
        <Polyline positions={previewPoints}
          pathOptions={{ color: '#639922', weight: 2, dashArray: '6 6', opacity: 0.8 }}
        />
      )}
      {mode === 'drawing' && mousePos && points.length >= 2 && (
        <Polyline positions={[mousePos, points[0]]}
          pathOptions={{ color: '#639922', weight: 1.5, dashArray: '4 8', opacity: 0.4 }}
        />
      )}
      {(mode === 'drawing' || mode === 'complete' || mode === 'editing') &&
        points.map((point, i) => (
          <DraggablePoint
            key={i} position={point} index={i}
            isFirst={i === 0} isSelected={selectedPointIndex === i}
            mode={mode} onMove={onMovePoint} onSelect={onSelectPoint}
            onClosePolygon={handleClosePolygon}
          />
        ))
      }
    </>
  )
}

// ─── Field placement layer ────────────────────────────────────────────
function FieldPlacementLayer({
  active,
  farmBoundary,
  onPlace,
  onOutsideBoundary,
}: {
  active: boolean
  farmBoundary: L.LatLng[]
  onPlace: (lat: number, lng: number) => void
  onOutsideBoundary: () => void
}) {
  const map = useMapEvents({
    dblclick(e) {
      if (!active) return
      L.DomEvent.stopPropagation(e)
      if (farmBoundary.length >= 3) {
        if (!isPointInPolygon(e.latlng, farmBoundary)) {
          onOutsideBoundary()
          return
        }
      }
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

// ─── Main FarmMap ─────────────────────────────────────────────────────
type Props = {
  center?: [number, number]
  zoom?: number
}

export default function FarmMap({ center = PR_CENTER, zoom = DEFAULT_ZOOM }: Props) {
  const drawing = useDrawing()
  const [showFieldEditor, setShowFieldEditor] = useState(false)
  const [fieldEditorPos, setFieldEditorPos] = useState<{ lat: number; lng: number } | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [placingField, setPlacingField] = useState(false)
  const [outsideBoundaryWarning, setOutsideBoundaryWarning] = useState(false)

  const { fields, addField, removeField, removeFieldsByFarmId } = useFieldStore()
  const { activeFarm, updateFarm, deleteFarm, addFieldIdToFarm, removeFieldIdFromFarm } = useFarmStore()

  // Only show fields belonging to the active farm
  const farmFields = activeFarm
    ? fields.filter(f => f.farmId === activeFarm.id)
    : []

  // Farm boundary as LatLngs for point-in-polygon test
  const farmBoundaryLatLngs = activeFarm?.boundary
    ? boundaryToLatLngs(activeFarm.boundary)
    : []

  function handleSaveFarm() {
    if (!activeFarm || drawing.points.length < 3) return
    // Save boundary to farm store
    const boundary = drawing.points.map(p => ({ lat: p.lat, lng: p.lng }))
    updateFarm(activeFarm.id, { boundary })
  }

  function handleDeleteFarm() {
    if (!activeFarm) return
    if (!window.confirm(`¿Eliminar la finca "${activeFarm.name}" y todos sus campos?`)) return
    // Delete all fields belonging to this farm
    removeFieldsByFarmId(activeFarm.id)
    deleteFarm(activeFarm.id)
  }

  function handleAddField() {
    if (!activeFarm?.boundary || activeFarm.boundary.length < 3) {
      alert('Primero debes guardar el límite de tu finca.')
      return
    }
    setPlacingField(true)
    setOutsideBoundaryWarning(false)
  }

  function handleEditField(fieldId: string) {
    const field = fields.find(f => f.id === fieldId)
    if (!field) return
    setEditingFieldId(fieldId)
    setFieldEditorPos({ lat: field.farmLat, lng: field.farmLng })
    setShowFieldEditor(true)
  }

  function handleFieldSaved(fieldId: string, isNew: boolean) {
    if (isNew && activeFarm) {
      addFieldIdToFarm(activeFarm.id, fieldId)
    }
  }

  function handleDeleteField(fieldId: string) {
    if (!activeFarm) return
    removeField(fieldId)
    removeFieldIdFromFarm(activeFarm.id, fieldId)
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
        onSave={handleSaveFarm}
        onAddField={handleAddField}
        onDeleteFarm={handleDeleteFarm}
      />

      <FieldListDrawer
        farmId={activeFarm?.id ?? null}
        onEditField={handleEditField}
        onDeleteField={handleDeleteField}
      />

      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={false}
        maxZoom={22}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri"
          maxZoom={22}
          maxNativeZoom={19}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution=""
          maxZoom={22}
          maxNativeZoom={19}
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

        {/* Only show fields for active farm */}
        {farmFields.map(field => (
          <PlacedField
            key={field.id}
            field={field}
            onEdit={handleEditField}
          />
        ))}

        <FieldPlacementLayer
          active={placingField}
          farmBoundary={farmBoundaryLatLngs}
          onPlace={(lat, lng) => {
            setFieldEditorPos({ lat, lng })
            setPlacingField(false)
            setEditingFieldId(null)
            setShowFieldEditor(true)
          }}
          onOutsideBoundary={() => {
            setOutsideBoundaryWarning(true)
            setTimeout(() => setOutsideBoundaryWarning(false), 3000)
          }}
        />
      </MapContainer>

      {/* Field editor */}
      {showFieldEditor && fieldEditorPos && (
        <FieldEditor
          farmId={activeFarm?.id ?? ''}
          farmLat={fieldEditorPos.lat}
          farmLng={fieldEditorPos.lng}
          editingFieldId={editingFieldId}
          onClose={() => {
            setShowFieldEditor(false)
            setEditingFieldId(null)
          }}
          onSaved={handleFieldSaved}
        />
      )}

      {/* Placement instruction */}
      {placingField && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg transition-colors ${
          outsideBoundaryWarning
            ? 'bg-red-600 text-white'
            : 'bg-[#2d4a1e] text-[#d4e8b0]'
        }`}>
          {outsideBoundaryWarning
            ? 'Ese punto está fuera de los límites de tu finca'
            : 'Haz doble clic dentro de tu finca para ubicar el campo'
          }
        </div>
      )}

    </div>
  )
}