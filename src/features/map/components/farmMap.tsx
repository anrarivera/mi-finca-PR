import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMapEvents, useMap, Polygon, Polyline, CircleMarker } from 'react-leaflet'
import * as L from 'leaflet'
import { useDrawing, findNearestEdgeIndex } from '../hooks/useDrawing'
import DrawingPanel from './drawingPanel'
import FarmDrawer from '@/features/farm/components/farmDrawer'
import FarmFieldEditor from '@/features/field/components/farmFieldEditor'
import PlacedField from '@/features/field/components/placedField'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore } from '@/store/useFarmStore'
import { isPointInPolygon, boundaryToLatLngs } from '@/features/field/utils/geoUtils'
import type { Farm } from '@/store/useFarmStore'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const PR_CENTER: [number, number] = [18.2208, -66.5901]
const DEFAULT_ZOOM = 9

// ─── Map controller — flies to a farm boundary ────────────────────────
function MapController({ targetFarm }: { targetFarm: Farm | null }) {
  const map = useMap()

  useEffect(() => {
    if (!targetFarm?.boundary || targetFarm.boundary.length < 3) return
    const bounds = L.latLngBounds(
      targetFarm.boundary.map(p => L.latLng(p.lat, p.lng))
    )
    map.flyToBounds(bounds, { padding: [40, 40], duration: 1.2 })
  }, [targetFarm?.id])

  return null
}

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
  const markerRef = useRef<L.CircleMarker | null>(null)
  const isDragging = useRef(false)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)
  const map = useMapEvents({})

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    const el = marker.getElement()
    if (!el) return
    const safeEl = el as HTMLElement

    safeEl.style.cursor = mode === 'editing' ? 'grab' : 'pointer'

    function onMouseDown(e: MouseEvent) {
      e.stopPropagation()
      mouseDownPos.current = { x: e.clientX, y: e.clientY }
      isDragging.current = false
      map.dragging.disable()

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
      ref={markerRef}
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
      L.DomEvent.stopPropagation(e.originalEvent)
      L.DomEvent.preventDefault(e.originalEvent)
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
        <Polyline
          positions={previewPoints}
          pathOptions={{ color: '#639922', weight: 2, dashArray: '6 6', opacity: 0.8 }}
        />
      )}
      {mode === 'drawing' && mousePos && points.length >= 2 && (
        <Polyline
          positions={[mousePos, points[0]]}
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

// ─── Main FarmMap ─────────────────────────────────────────────────────
type Props = {
  center?: [number, number]
  zoom?: number
}

export default function FarmMap({ center = PR_CENTER, zoom = DEFAULT_ZOOM }: Props) {
  const drawing = useDrawing()
  const [showFieldEditor, setShowFieldEditor] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [flyTarget, setFlyTarget] = useState<Farm | null>(null)

  const { fields, removeField, removeFieldsByFarmId } = useFieldStore()
  const {
    farms, activeFarm, favoriteFarmId,
    updateFarm, deleteFarm, setActiveFarm,
    addFieldIdToFarm, removeFieldIdFromFarm, addFarm,
  } = useFarmStore()

  // Only show fields belonging to the active farm
  const farmFields = activeFarm
    ? fields.filter(f => f.farmId === activeFarm.id)
    : []

  // On mount — fly to favorite or first farm
  useEffect(() => {
    if (farms.length === 0) return
    const target = farms.find(f => f.id === favoriteFarmId) ?? farms[0]
    setActiveFarm(target)
    setFlyTarget(target)
  }, [])

  function handleSaveFarm() {
    if (!activeFarm || drawing.points.length < 3) return
    const boundary = drawing.points.map(p => ({ lat: p.lat, lng: p.lng }))
    updateFarm(activeFarm.id, { boundary })
  }

  function handleDeleteFarm() {
    if (!activeFarm) return
    if (!window.confirm(`¿Eliminar la finca "${activeFarm.name}" y todos sus campos?`)) return
    removeFieldsByFarmId(activeFarm.id)
    deleteFarm(activeFarm.id)
  }

  function handleOpenFieldEditor() {
    if (!activeFarm?.boundary || activeFarm.boundary.length < 3) {
      alert('Primero guarda el límite de tu finca antes de añadir campos.')
      return
    }
    setShowFieldEditor(true)
  }

  function handleCreateFarm(data: { name: string; location: string }) {
    const newFarm: Farm = {
      id: `farm_${Date.now()}`,
      name: data.name,
      location: data.location,
      totalAreaAcres: 0,
      createdAt: new Date().toISOString(),
      boundary: [],
      fieldIds: [],
    }
    addFarm(newFarm)
    setActiveFarm(newFarm)
    setShowModal(false)
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
        onAddField={handleOpenFieldEditor}
        onDeleteFarm={handleDeleteFarm}
      />

      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        zoomControl={false}
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

        {/* Flies to farm when flyTarget changes */}
        <MapController targetFarm={flyTarget} />

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

        {/* Fields for the active farm */}
        {farmFields.map(field => (
          <PlacedField
            key={field.id}
            field={field}
            onEdit={handleOpenFieldEditor}
          />
        ))}

      </MapContainer>

      {/* Farm + field navigation drawer */}
      <FarmDrawer
        onAddFarm={() => setShowModal(true)}
        onEditField={(fieldId) => {
          setShowFieldEditor(true)
        }}
        onDeleteField={(fieldId) => {
          if (!activeFarm) return
          removeField(fieldId)
          removeFieldIdFromFarm(activeFarm.id, fieldId)
        }}
        onFlyToFarm={(farm) => {
          setActiveFarm(farm)
          setFlyTarget(farm)
        }}
        onOpenFieldEditor={() => handleOpenFieldEditor()}
      />

      {/* Farm field editor — full screen */}
      {showFieldEditor && activeFarm && (
        <FarmFieldEditor
          farmId={activeFarm.id}
          onClose={() => setShowFieldEditor(false)}
          onFieldSaved={(fieldId, isNew) => {
            if (isNew) addFieldIdToFarm(activeFarm.id, fieldId)
          }}
          onFieldDeleted={(fieldId) => {
            removeFieldIdFromFarm(activeFarm.id, fieldId)
          }}
        />
      )}

      {/* Create farm modal */}
      {showModal && (
        <CreateFarmModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateFarm}
        />
      )}

    </div>
  )
}