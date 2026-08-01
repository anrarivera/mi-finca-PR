import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, TileLayer, useMapEvents, useMap, Polygon, Polyline, CircleMarker } from 'react-leaflet'
import * as L from 'leaflet'
import {
  useFarms,
  useCreateFarm,
  useUpdateFarm,
  useDeleteFarm,
} from '@/features/farm/hooks/useFarmsApi'
import { useDrawing, findNearestEdgeIndex } from '../hooks/useDrawing'
import { attachPointerDrag } from '../utils/pointerDrag'
import { useIsCoarsePointer } from '@/hooks/useViewport'
import DrawingPanel from './drawingPanel'
import FarmDrawer from '@/features/farm/components/farmDrawer'
import PlacedField from '@/features/field/components/placedField'
import {
  useMapFieldEditing, MapFieldEditingLayer, MapFieldEditingPanels,
} from '@/features/field/components/mapFieldEditing'
import { useOperations } from '@/features/field/hooks/useOperationsApi'
import { buildPlantMarks } from '@/features/field/utils/plantStatus'
import { useFindings } from '@/features/scouting/hooks/useFindingsApi'
import { buildFindingMarks } from '@/features/scouting/utils/findingScope'
import { fieldHealth } from '@/features/scouting/utils/fieldHealth'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore, canManageStructure, isFarmOwner } from '@/store/useFarmStore'
import type { Farm } from '@/store/useFarmStore'
import type { PlacedField as FieldModel } from '@/features/field/types'
import { toast } from '@/store/useToastStore'

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const PR_CENTER: [number, number] = [18.2208, -66.5901]
const DEFAULT_ZOOM = 9

// ─── Map controller — flies to a farm boundary. The nonce re-triggers
//     the flight for the same farm (e.g. zooming back out of a field). ──
function MapController({ target }: { target: { farm: Farm; nonce: number } | null }) {
  const map = useMap()
  useEffect(() => {
    const farm = target?.farm
    if (!farm?.boundary || farm.boundary.length < 3) return
    const bounds = L.latLngBounds(
      farm.boundary.map(p => L.latLng(p.lat, p.lng))
    )
    map.flyToBounds(bounds, { padding: [40, 40], duration: 1.2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.farm.id, target?.nonce])
  return null
}

// ─── Field zoom controller — flies to a field's bounds (same zoom the
//     map's own field double-click does in PlacedField) ────────────────
function FieldZoomController({ target }: {
  target: { field: FieldModel; nonce: number } | null
}) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    const f = target.field
    if (f.boundary && f.boundary.length >= 3) {
      const bounds = L.latLngBounds(f.boundary.map(p => L.latLng(p.lat, p.lng)))
      map.flyToBounds(bounds, { padding: [60, 60], duration: 0.8 })
    } else {
      map.flyTo(L.latLng(f.farmLat, f.farmLng), Math.max(map.getZoom(), 18))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce])
  return null
}

// ─── Map resizer ──────────────────────────────────────────────────────
function MapResizer() {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
  }, [map])
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
  const map = useMapEvents({})
  const coarse = useIsCoarsePointer()

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    const el = marker.getElement()
    if (!el) return
    const safeEl = el as HTMLElement

    safeEl.style.cursor = mode === 'editing' ? 'grab' : 'pointer'

    return attachPointerDrag(safeEl, map, {
      onMove: (latlng) => onMove(index, latlng),
      onTap: () => {
        if (mode === 'drawing' && isFirst) onClosePolygon()
        else if (mode === 'editing') onSelect(index)
      },
    })
  }, [index, isFirst, mode, map, onMove, onSelect, onClosePolygon])

  // Fingers need a bigger target than a mouse cursor
  const radius = (isFirst ? 8 : isSelected ? 8 : 6) + (coarse ? 4 : 0)
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

  // ── No activeFarm/drawing references here — those belong in FarmMap ──

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
  const { t } = useTranslation('farm')
  const drawing = useDrawing()
  const [showModal, setShowModal] = useState(false)
  const [flyTarget, setFlyTarget] = useState<{ farm: Farm; nonce: number } | null>(null)
  // Field selected by a single map click — opens the farm drawer focused on
  // that field's card (double click starts editing instead). The nonce
  // re-triggers the drawer when the same field is clicked again.
  const [focusRequest, setFocusRequest] = useState<{ fieldId: string; nonce: number } | null>(null)
  // Farm drawer open state lives here so it survives the drawer unmounting
  // during a field-editing session — closing the editor reveals it again.
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Fly-to-field request (drawer card double-click / Editar). The nonce
  // re-triggers the flight when the same field is requested again.
  const [zoomTarget, setZoomTarget] = useState<{ field: FieldModel; nonce: number } | null>(null)
  const boundaryLoaded = useRef(false)

  const { fields, removeField } = useFieldStore()
  useFarms() // hydrates the farm store; loading state unused here
  const createFarm = useCreateFarm()
  const updateFarmApi = useUpdateFarm()
  const deleteFarmApi = useDeleteFarm()

  const {
    farms, activeFarm, favoriteFarmId,
    setActiveFarm, removeFieldIdFromFarm,
  } = useFarmStore()

  const farmFields = activeFarm
    ? fields.filter(f => f.farmId === activeFarm.id)
    : []

  function flyToFarm(farm: Farm) {
    setFlyTarget(prev => ({ farm, nonce: (prev?.nonce ?? 0) + 1 }))
  }

  // Fly the map to a field — same zoom the map's own field double-click
  // performs, reused by the drawer cards.
  function zoomToField(fieldId: string) {
    const field = fields.find(f => f.id === fieldId)
    if (field) setZoomTarget(prev => ({ field, nonce: (prev?.nonce ?? 0) + 1 }))
  }

  // Clear the field selection. Fly back out ONLY if a field zoom actually
  // happened — flying to the farm bounds unconditionally made the map
  // wobble in place ("shake") every time the drawer closed, because
  // Leaflet animates a flyTo even when the target view is the current one.
  function unselectField() {
    setFocusRequest(null)
    if (zoomTarget && activeFarm) {
      setZoomTarget(null)
      flyToFarm(activeFarm)
    }
  }

  // Field/card single click toggles: clicking the selected field again
  // unselects it (and zooms out).
  function toggleSelectField(fieldId: string) {
    if (focusRequest?.fieldId === fieldId) unselectField()
    else setFocusRequest(prev => ({ fieldId, nonce: (prev?.nonce ?? 0) + 1 }))
  }

  // ── On-map field editing session — replaces the old full-screen
  //    editor. While active, the drawer and farm-boundary tools yield
  //    to the editing panel and map layer. ─────────────────────────────
  const fieldEditing = useMapFieldEditing(
    activeFarm?.id ?? '',
    activeFarm?.boundary ?? [],
    {
      onSaved: (fieldId) =>
        setFocusRequest(prev => ({ fieldId, nonce: (prev?.nonce ?? 0) + 1 })),
    }
  )

  // Plant/row ids already covered by operations — colors plant dots
  // (white = planned, green = planted, red = harvested/removed).
  const { data: farmOps } = useOperations(activeFarm?.id ?? null)
  const plantMarks = useMemo(() => buildPlantMarks(farmOps ?? []), [farmOps])

  // Unresolved scouting findings — paint affected rows/plants amber→red.
  const { data: farmFindings } = useFindings(activeFarm?.id ?? null)
  const findingMarks = useMemo(() => buildFindingMarks(farmFindings ?? []), [farmFindings])

  // Traffic-light field colors: gray = bare, green = healthy, amber→red =
  // alerting findings (severa always; leve/moderada past the extent
  // threshold). The stored field.color is no longer shown on the map.
  const healthColors = useMemo(
    () => new Map(farmFields.map(f => [
      f.id,
      fieldHealth(
        { id: f.id, rows: f.rows ?? [], freePlants: f.freePlants ?? [] },
        farmFindings ?? []
      ).color,
    ])),
    [farmFields, farmFindings]
  )

  // On mount — fly to favorite or first farm
  useEffect(() => {
    if (farms.length === 0) return
    const target = farms.find(f => f.id === favoriteFarmId) ?? farms[0]
    setActiveFarm(target)
    flyToFarm(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farms.length])

  // Closing the field editor keeps the edited field selected — a map
  // double-click skips the single-click select, and a cancel has no
  // onSaved, so restore the selection on the way out for both.
  const lastEditedFieldId = useRef<string | null>(null)
  useEffect(() => {
    if (fieldEditing.active) {
      if (fieldEditing.editingFieldId) lastEditedFieldId.current = fieldEditing.editingFieldId
    } else if (lastEditedFieldId.current) {
      const fieldId = lastEditedFieldId.current
      lastEditedFieldId.current = null
      setFocusRequest(prev => ({ fieldId, nonce: (prev?.nonce ?? 0) + 1 }))
    }
  }, [fieldEditing.active, fieldEditing.editingFieldId])

  // When active farm loads, restore its boundary into the drawing layer
  useEffect(() => {
    if (!activeFarm?.boundary || activeFarm.boundary.length < 3) return
    if (boundaryLoaded.current) return  // only load once per farm
    boundaryLoaded.current = true
    const points = activeFarm.boundary.map(p => L.latLng(p.lat, p.lng))
    drawing.loadBoundary(points)
  }, [activeFarm?.id, activeFarm?.boundary])

  // Reset boundary loaded flag when farm changes
  useEffect(() => {
    boundaryLoaded.current = false
  }, [activeFarm?.id])

  async function handleSaveFarm() {
  if (!activeFarm) {
    toast.error(t('map.noActiveFarm'))
    return
  }
  if (drawing.points.length < 3) {
    toast.error(t('map.needThreePoints'))
    return
  }

  const boundary = drawing.points.map(p => ({ lat: p.lat, lng: p.lng }))
  try {
    await updateFarmApi.mutateAsync({ id: activeFarm.id, data: { boundary } })
    toast.success(t('map.farmSaved'))
    drawing.finishEditing()
  } catch (err) {
    console.error('Failed to save farm:', err)
    // toast.error already fired by api.ts handleResponse
  }
}

// Touch path for the dblclick vertex insertion: add a point at the
// midpoint of the edge after the selected vertex, then drag it into place.
function handleInsertPointAfterSelected() {
  const i = drawing.selectedPointIndex
  if (i === null) return
  const a = drawing.points[i]
  const b = drawing.points[(i + 1) % drawing.points.length]
  drawing.insertPointAfter(i, L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2))
}

async function handleDeleteFarm() {
  if (!activeFarm) return
  if (!window.confirm(t('confirmDeleteFarm', { name: activeFarm.name }))) return
  try {
    await deleteFarmApi.mutateAsync(activeFarm.id)
    toast.success(t('map.farmDeleted'))
  } catch (err) {
    console.error('Failed to delete farm:', err)
    // toast.error already fired by api.ts handleResponse
  }
}

  // Start on-map field editing — with a fieldId it opens straight into
  // editing that field (double-click on a map field or a drawer card);
  // without one it starts a new field. Guarded against non-string args so
  // it can back onClick handlers directly.
  function handleOpenFieldEditor(fieldId?: unknown) {
    if (!activeFarm?.boundary || activeFarm.boundary.length < 3) {
      alert(t('map.saveBoundaryFirst'))
      return
    }
    if (typeof fieldId === 'string') {
      // Editing an existing field: leave the farm drawer open behind the
      // editor so it's there when the editing session ends.
      setDrawerOpen(true)
      fieldEditing.startEdit(fieldId)
    } else {
      fieldEditing.startNew()
    }
  }

  async function handleCreateFarm(data: { name: string; location: string }) {
    try {
      await createFarm.mutateAsync({
        name: data.name,
        location: data.location,
        farmType: 'mixed',
      })
      setShowModal(false)
    } catch (err) {
      console.error('Failed to create farm:', err)
      alert(t('map.createFarmError'))
    }
  }

  return (
    <div className="flex-1 w-full h-full relative">

      {/* Farm-boundary tools yield to the field-editing panel.
          Boundary work is farm structure — admins and owners only. */}
      {!fieldEditing.active && canManageStructure(activeFarm) && (
        <DrawingPanel
          canDeleteFarm={isFarmOwner(activeFarm)}
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
          onUndoPoint={drawing.undoLastPoint}
          onDeleteSelectedPoint={drawing.deleteSelectedPoint}
          onInsertPointAfterSelected={handleInsertPointAfterSelected}
        />
      )}

      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        zoomControl={false}
        scrollWheelZoom={true}
        doubleClickZoom={false}
        maxZoom={22}
      >
        <MapResizer />
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

        <MapController target={flyTarget} />
        <FieldZoomController target={zoomTarget} />

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

        {farmFields
          // The field being edited is rendered live by the editing layer
          .filter(field => !(fieldEditing.active && field.id === fieldEditing.editingFieldId))
          .map(field => (
            <PlacedField
              key={field.id}
              field={field}
              detailed={field.id === focusRequest?.fieldId}
              plantMarks={plantMarks}
              findingMarks={findingMarks}
              displayColor={healthColors.get(field.id)}
              onSelect={(fieldId) => {
                if (fieldEditing.active) return // don't switch mid-edit
                toggleSelectField(fieldId)
              }}
              onOpenEditor={(fieldId) => {
                // Field structure is admin+ — operators stay out of the
                // editor entirely (the server rejects their saves anyway).
                if (!canManageStructure(activeFarm)) return
                // Double-clicking another field mid-edit switches the
                // editor to it (the zoom already happened in PlacedField).
                if (fieldEditing.active) {
                  if (fieldId === fieldEditing.editingFieldId) return
                  if (!window.confirm(t('map.confirmSwitchField'))) return
                }
                handleOpenFieldEditor(fieldId)
              }}
            />
          ))}

        {/* On-map field editing (boundary, rows, plants) */}
        {fieldEditing.active && (
          <MapFieldEditingLayer session={fieldEditing} plantMarks={plantMarks} />
        )}
      </MapContainer>

      {/* While editing a field, the drawer is replaced by the editor panel */}
      {!fieldEditing.active && (
      <FarmDrawer
        isOpen={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          // Hiding the drawer clears the selection and zooms back out
          if (!open) unselectField()
        }}
        focusRequest={focusRequest}
        // Card click → select the field on the map (highlight + plants);
        // clicking the selected card again unselects and zooms out
        onSelectField={toggleSelectField}
        onAddFarm={() => setShowModal(true)}
        // Card double-click selects the field (never toggles it off) and
        // zooms to it; only the Editar button (onEditField) opens the
        // editor — zooming there too.
        onZoomToField={(fieldId) => {
          setFocusRequest(prev => ({ fieldId, nonce: (prev?.nonce ?? 0) + 1 }))
          zoomToField(fieldId)
        }}
        onEditField={(fieldId) => {
          zoomToField(fieldId)
          handleOpenFieldEditor(fieldId)
        }}
        onDeleteField={(fieldId) => {
          if (!activeFarm) return
          removeField(fieldId)
          removeFieldIdFromFarm(activeFarm.id, fieldId)
        }}
        onFlyToFarm={(farm) => {
          setActiveFarm(farm)
          flyToFarm(farm)
        }}
        // The drawer passes the FARM id here — don't let it be mistaken
        // for a field id; start a NEW field instead.
        onOpenFieldEditor={() => handleOpenFieldEditor()}
      />
      )}

      {/* Field editing panels (left tools + contextual sub-panels) */}
      <MapFieldEditingPanels session={fieldEditing} />

      {showModal && (
        <CreateFarmModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateFarm}
        />
      )}

    </div>
  )
}