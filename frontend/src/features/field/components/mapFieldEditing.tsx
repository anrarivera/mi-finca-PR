import { useEffect, useMemo, useRef, useState } from 'react'
import { Polygon, Polyline, CircleMarker, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import { useFieldEditor } from '../hooks/useFieldEditor'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore } from '@/store/useFarmStore'
import { useCreateField, useUpdateField } from '../hooks/useFieldsApi'
import { useCreateOperation } from '../hooks/useOperationsApi'
import { latlngToCanvas, canvasToLatlng, farmBoundaryToBBox } from '../utils/canvasGeo'
import type { BBox } from '../utils/canvasGeo'
import { getCropById } from '../data/cropLibrary'
import { randomFieldColor } from '../types'
import type { CanvasPoint, FieldRow, LatLngPoint } from '../types'
import { plantVisualStatus, PLANT_STATUS_STYLE, type PlantMarks } from '../utils/plantStatus'
import FarmFieldEditorPanel from './farmFieldEditorPanel'
import RowConfigPanel from './rowConfigPanel'
import RowFillPanel from './rowFillPanel'
import RowEditPanel from './rowEditPanel'
import PlantEditPanel, { REMOVAL_REASONS, type PlantRemovalReason } from './plantEditPanel'
import { toast } from '@/store/useToastStore'

// ──────────────────────────────────────────────────────────────────────────
// On-map field editing — replaces the old full-screen SVG editor. The same
// useFieldEditor state machine drives everything; this module just swaps the
// view: boundary drawing, rows, and plants are rendered and manipulated
// directly on the Leaflet map (the canvas↔lat/lng conversion is a fixed
// linear transform through the farm bbox, so all editor math is unchanged).
//
// Three exports, consumed by farmMap:
//   useMapFieldEditing  — the session (state + save/cancel/Esc/removal logs)
//   MapFieldEditingLayer — react-leaflet layer INSIDE the MapContainer
//   MapFieldEditingPanels — left tool panel + right sub-panels, over the map
// ──────────────────────────────────────────────────────────────────────────

type PendingRemovalLog = {
  plantId: string
  cropTypeId: string
  reason: PlantRemovalReason
  notes?: string
}

// ── The session hook ──────────────────────────────────────────────────
export function useMapFieldEditing(
  farmId: string,
  farmBoundary: LatLngPoint[],
  opts?: { onSaved?: (fieldId: string) => void }
) {
  const editor = useFieldEditor()
  const { getField } = useFieldStore()
  const { addFieldIdToFarm } = useFarmStore()
  const createField = useCreateField(farmId)
  const updateField_api = useUpdateField(farmId)
  const createOperation = useCreateOperation(farmId)

  const [active, setActive] = useState(false)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [editingRowIds, setEditingRowIds] = useState<string[] | null>(null)
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null)
  // Rows checked in the tool panel's row list — highlighted on the map.
  const [highlightedRowIds, setHighlightedRowIds] = useState<string[]>([])
  const [removalLogs, setRemovalLogs] = useState<PendingRemovalLog[]>([])

  // The lat/lng↔canvas transform for this farm — all editor coordinates
  // flow through it.
  const bbox: BBox | null = useMemo(
    () => (farmBoundary.length >= 3 ? farmBoundaryToBBox(farmBoundary) : null),
    [JSON.stringify(farmBoundary)]
  )

  function reset() {
    editor.reset()
    setEditingFieldId(null)
    setIsCreatingNew(false)
    setEditingRowIds(null)
    setSelectedPlantId(null)
    setHighlightedRowIds([])
    setRemovalLogs([])
  }

  // ── Start editing an existing field ─────────────────────────────
  function startEdit(fieldId: string) {
    if (!bbox) return
    const field = getField(fieldId)
    if (!field) return
    reset()
    editor.loadField(field, bbox)
    setEditingFieldId(fieldId)
    setActive(true)
  }

  // ── Start a brand new field ─────────────────────────────────────
  function startNew() {
    if (!bbox) return
    reset()
    editor.setFieldId(`field_${Date.now()}`)
    setIsCreatingNew(true)
    setActive(true)
  }

  // ── Cancel — discard edits and queued removal logs ──────────────
  function cancel() {
    reset()
    setActive(false)
  }

  // ── Plant removal (with reason) — queued, flushed on save ───────
  function removePlant(plant: { id: string; cropTypeId: string }, reason: PlantRemovalReason, notes?: string) {
    // New unsaved fields skip logging — removing a just-placed plant
    // isn't a farm event.
    if (editingFieldId) {
      setRemovalLogs(prev => [...prev, {
        plantId: plant.id, cropTypeId: plant.cropTypeId, reason, notes,
      }])
    }
    editor.deletePlantById(plant.id)
    setSelectedPlantId(null)
  }

  async function flushRemovalLogs(fieldId: string) {
    if (removalLogs.length === 0) return
    const today = new Date().toISOString().split('T')[0]
    await Promise.all(removalLogs.map(log => {
      const cropName = getCropById(log.cropTypeId)?.nameEs ?? log.cropTypeId
      const reasonLabel = REMOVAL_REASONS.find(r => r.id === log.reason)?.labelEs ?? log.reason
      return createOperation.mutateAsync({
        type: log.reason === 'harvested' ? 'harvest' : 'other',
        actualDate: today,
        fieldId,
        cropTypeId: log.cropTypeId,
        plantIds: [log.plantId],
        notes: `Planta de ${cropName} eliminada — ${reasonLabel.toLowerCase()}`
          + (log.notes ? `: ${log.notes}` : ''),
      })
    }))
    setRemovalLogs([])
  }

  // ── Save ─────────────────────────────────────────────────────────
  async function save() {
    if (editor.points.length < 3 || !editor.name.trim() || !bbox) return
    const boundaryLatLng = editor.canvasPointsToLatLng(bbox)

    if (editingFieldId) {
      await updateField_api.mutateAsync({
        id: editingFieldId,
        updates: {
          name: editor.name,
          shape: editor.shape,
          boundary: boundaryLatLng,
          rows: editor.rows,
          freePlants: editor.freePlants,
          plantingEvents: editor.plantingEvents,
        },
      })
      await flushRemovalLogs(editingFieldId)
      toast.success('Campo actualizado')
      opts?.onSaved?.(editingFieldId)
    } else {
      const saved = await createField.mutateAsync({
        name: editor.name,
        color: randomFieldColor(),
        shape: editor.shape,
        boundary: boundaryLatLng,
        farmLat: boundaryLatLng.reduce((s, p) => s + p.lat, 0) / boundaryLatLng.length,
        farmLng: boundaryLatLng.reduce((s, p) => s + p.lng, 0) / boundaryLatLng.length,
        rotation: 0,
        isPositioning: false,
        displayMode: 'shape' as const,
        rows: editor.rows,
        freePlants: editor.freePlants,
        plantingEvents: editor.plantingEvents,
      } as any)
      addFieldIdToFarm(farmId, saved.id)
      toast.success('Campo guardado')
      opts?.onSaved?.(saved.id)
    }
    reset()
    setActive(false)
  }

  // ── Escape backs out one level at a time ─────────────────────────
  useEffect(() => {
    if (!active) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (selectedPlantId) { setSelectedPlantId(null); return }
      if (editingRowIds) { setEditingRowIds(null); return }
      switch (editor.mode) {
        case 'rowConfig':
        case 'addRow': editor.cancelRowConfig(); return
        case 'fillRows': editor.cancelFillRows(); return
        case 'addFreePlant': editor.stopAddFreePlant(); return
        default: cancel(); return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, editor.mode, selectedPlantId, editingRowIds])

  // Boundary of the field being edited (feeds row fill/edit panels).
  const editingBoundary: LatLngPoint[] = bbox
    ? (editingFieldId
        ? (getField(editingFieldId)?.boundary ?? editor.canvasPointsToLatLng(bbox))
        : editor.canvasPointsToLatLng(bbox))
    : []

  return {
    editor, bbox, active, editingFieldId, isCreatingNew,
    editingRowIds, setEditingRowIds,
    selectedPlantId, setSelectedPlantId,
    highlightedRowIds, setHighlightedRowIds,
    editingBoundary,
    startEdit, startNew, cancel, save, removePlant,
  }
}

export type MapFieldEditingSession = ReturnType<typeof useMapFieldEditing>

// ── Draggable boundary vertex ─────────────────────────────────────────
function BoundaryVertex({
  position, index, isFirst, isSelected, session,
}: {
  position: L.LatLng
  index: number
  isFirst: boolean
  isSelected: boolean
  session: MapFieldEditingSession
}) {
  const markerRef = useRef<L.CircleMarker | null>(null)
  const isDragging = useRef(false)
  const map = useMapEvents({})
  const { editor, bbox } = session

  useEffect(() => {
    const marker = markerRef.current
    if (!marker || !bbox) return
    const el = marker.getElement() as HTMLElement | null
    if (!el) return
    el.style.cursor = 'grab'

    function onMouseDown(e: MouseEvent) {
      e.stopPropagation()
      isDragging.current = false
      map.dragging.disable()

      function onMouseMove(ev: MouseEvent) {
        isDragging.current = true
        const containerPoint = map.mouseEventToContainerPoint(ev as any)
        const latlng = map.containerPointToLatLng(containerPoint)
        editor.movePoint(index, latlngToCanvas(latlng.lat, latlng.lng, bbox!))
      }
      function onMouseUp() {
        map.dragging.enable()
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        if (!isDragging.current) {
          if (editor.mode === 'drawing' && isFirst && editor.points.length >= 3) {
            editor.completeDrawing()
          } else {
            editor.setSelectedPointIndex(isSelected ? null : index)
          }
        }
        isDragging.current = false
      }
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    el.addEventListener('mousedown', onMouseDown)
    return () => el.removeEventListener('mousedown', onMouseDown)
  }, [index, isFirst, isSelected, map, editor.mode, editor.points.length, bbox])

  return (
    <CircleMarker
      ref={markerRef}
      center={position}
      radius={isFirst || isSelected ? 8 : 6}
      pathOptions={{
        color: isSelected ? '#ef4444' : '#2d4a1e',
        fillColor: isSelected ? '#ef4444' : isFirst ? '#639922' : 'white',
        fillOpacity: 1,
        weight: 2,
      }}
    />
  )
}

// ── The map layer (must live inside MapContainer) ─────────────────────
export function MapFieldEditingLayer({
  session, plantMarks,
}: {
  session: MapFieldEditingSession
  plantMarks: PlantMarks
}) {
  const { editor, bbox } = session
  const [rectDraft, setRectDraft] = useState<{ start: CanvasPoint; current: CanvasPoint } | null>(null)

  const map = useMapEvents({
    click(e) {
      if (!bbox) return
      const pt = latlngToCanvas(e.latlng.lat, e.latlng.lng, bbox)
      if (editor.mode === 'drawing' && editor.shape === 'polygon') {
        // Close when clicking near the first point
        if (editor.points.length >= 3) {
          const first = editor.points[0]
          const d = Math.hypot(first.x - pt.x, first.y - pt.y)
          if (d < 12) { editor.completeDrawing(); return }
        }
        editor.addPoint(pt)
      } else if (editor.mode === 'addRow') {
        editor.handleRowClick(pt)
      } else if (editor.mode === 'addFreePlant') {
        editor.placeFreePlant(pt, bbox)
      }
    },
    mousemove(e) {
      if (!bbox) return
      if (editor.mode === 'drawing' || editor.mode === 'addRow') {
        editor.setMousePos(latlngToCanvas(e.latlng.lat, e.latlng.lng, bbox))
      }
    },
    dblclick(e) {
      if (editor.mode === 'drawing' && editor.shape === 'polygon' && editor.points.length >= 3) {
        L.DomEvent.stopPropagation(e.originalEvent)
        editor.completeDrawing()
      }
    },
  })

  // Rectangle drawing — press-drag with map panning disabled.
  useEffect(() => {
    if (!bbox || editor.mode !== 'drawing' || editor.shape !== 'rectangle') return
    const container = map.getContainer()
    map.dragging.disable()
    container.style.cursor = 'crosshair'

    let start: CanvasPoint | null = null
    function toCanvas(ev: MouseEvent): CanvasPoint {
      const latlng = map.containerPointToLatLng(map.mouseEventToContainerPoint(ev as any))
      return latlngToCanvas(latlng.lat, latlng.lng, bbox!)
    }
    function onDown(ev: MouseEvent) {
      start = toCanvas(ev)
      setRectDraft({ start, current: start })
    }
    function onMove(ev: MouseEvent) {
      if (!start) return
      setRectDraft({ start, current: toCanvas(ev) })
    }
    function onUp(ev: MouseEvent) {
      if (!start) return
      const end = toCanvas(ev)
      if (Math.abs(end.x - start.x) > 2 && Math.abs(end.y - start.y) > 2) {
        editor.setRectangle(start, end) // → mode 'complete'
      }
      start = null
      setRectDraft(null)
    }
    container.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      container.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      container.style.cursor = ''
      map.dragging.enable()
      setRectDraft(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.mode, editor.shape, bbox, map])

  // Cursor hints for the click-to-place modes.
  useEffect(() => {
    const container = map.getContainer()
    if (['addRow', 'addFreePlant'].includes(editor.mode) ||
        (editor.mode === 'drawing' && editor.shape === 'polygon')) {
      container.style.cursor = 'crosshair'
      return () => { container.style.cursor = '' }
    }
  }, [editor.mode, editor.shape, map])

  if (!bbox) return null

  const toLatLng = (p: CanvasPoint) => {
    const g = canvasToLatlng(p.x, p.y, bbox)
    return L.latLng(g.lat, g.lng)
  }
  const boundaryLatLngs = editor.points.map(toLatLng)

  const rowPositions = (row: FieldRow): L.LatLng[] =>
    row.path && row.path.length >= 2
      ? row.path.map(p => L.latLng(p.lat, p.lng))
      : [L.latLng(row.startLat, row.startLng), L.latLng(row.endLat, row.endLng)]

  // Rows highlighted amber: whatever the row-edit panel targets, plus any
  // rows checked in the tool panel's row list.
  const highlightedRows = new Set([
    ...(session.editingRowIds ?? []),
    ...session.highlightedRowIds,
  ])

  return (
    <>
      {/* Boundary — solid when complete, dashed preview while drawing */}
      {editor.points.length >= 3 && editor.mode !== 'drawing' && (
        <Polygon
          positions={boundaryLatLngs}
          pathOptions={{ color: '#639922', fillColor: '#639922', fillOpacity: 0.12, weight: 2.5 }}
        />
      )}
      {editor.mode === 'drawing' && boundaryLatLngs.length >= 1 && (
        <Polyline
          positions={editor.mousePos ? [...boundaryLatLngs, toLatLng(editor.mousePos)] : boundaryLatLngs}
          pathOptions={{ color: '#639922', weight: 2, dashArray: '6 6', opacity: 0.85 }}
        />
      )}
      {rectDraft && (
        <Polygon
          positions={[
            toLatLng(rectDraft.start),
            toLatLng({ x: rectDraft.current.x, y: rectDraft.start.y }),
            toLatLng(rectDraft.current),
            toLatLng({ x: rectDraft.start.x, y: rectDraft.current.y }),
          ]}
          pathOptions={{ color: '#639922', fillColor: '#639922', fillOpacity: 0.1, weight: 2, dashArray: '6 4' }}
        />
      )}

      {/* Boundary vertices — draggable */}
      {(editor.mode === 'drawing' || editor.mode === 'complete') &&
        boundaryLatLngs.map((pos, i) => (
          <BoundaryVertex
            key={i}
            position={pos}
            index={i}
            isFirst={i === 0}
            isSelected={editor.selectedPointIndex === i}
            session={session}
          />
        ))}

      {/* Rows — clickable to open the row editor */}
      {editor.rows.map(row => (
        <Polyline
          key={row.id}
          positions={rowPositions(row)}
          pathOptions={{
            color: highlightedRows.has(row.id) ? '#f59e0b' : 'white',
            weight: highlightedRows.has(row.id) ? 3.5 : 2,
            opacity: 0.95,
            dashArray: highlightedRows.has(row.id) ? undefined : '1 6',
            lineCap: 'round',
          }}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent)
              if (editor.mode !== 'complete') return
              session.setSelectedPlantId(null)
              session.setEditingRowIds([row.id])
            },
          }}
        />
      ))}

      {/* Fill preview rows */}
      {editor.fillPreviewRows.map(row => (
        <Polyline
          key={row.id}
          positions={rowPositions(row)}
          pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '4 6', opacity: 0.9 }}
        />
      ))}

      {/* Row-drawing rubber band */}
      {editor.mode === 'addRow' && editor.rowStartPoint && (
        <>
          <CircleMarker
            center={toLatLng(editor.rowStartPoint)}
            radius={4}
            pathOptions={{ color: '#2d4a1e', fillColor: '#f59e0b', fillOpacity: 1, weight: 1.5 }}
          />
          {editor.mousePos && (
            <Polyline
              positions={[toLatLng(editor.rowStartPoint), toLatLng(editor.mousePos)]}
              pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '4 6' }}
            />
          )}
        </>
      )}

      {/* Row draft while configuring */}
      {editor.rowDraft && (
        <Polyline
          positions={[
            toLatLng({ x: editor.rowDraft.startX, y: editor.rowDraft.startY }),
            toLatLng({ x: editor.rowDraft.endX, y: editor.rowDraft.endY }),
          ]}
          pathOptions={{ color: '#f59e0b', weight: 2.5 }}
        />
      )}

      {/* Plants — white planned / green planted / red removed; clickable */}
      {[
        ...editor.rows.flatMap(r => r.plants.map(p => ({ plant: p, rowId: r.id }))),
        ...editor.freePlants.map(p => ({ plant: p, rowId: undefined as string | undefined })),
      ].map(({ plant, rowId }) => {
        const status = plantVisualStatus(plant, plantMarks, rowId)
        const style = PLANT_STATUS_STYLE[status]
        const selected = plant.id === session.selectedPlantId
        return (
          <CircleMarker
            key={plant.id}
            center={L.latLng(plant.lat, plant.lng)}
            radius={selected ? 5 : 3.5}
            pathOptions={{
              color: selected ? '#f59e0b' : style.color,
              weight: selected ? 2 : 1,
              fillColor: style.fillColor,
              fillOpacity: 1,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e.originalEvent)
                if (editor.mode !== 'complete') return
                session.setEditingRowIds(null)
                session.setSelectedPlantId(plant.id)
              },
            }}
          />
        )
      })}
    </>
  )
}

// ── Panels overlay (outside the MapContainer) ─────────────────────────
export function MapFieldEditingPanels({ session }: { session: MapFieldEditingSession }) {
  const { editor, bbox } = session
  if (!session.active || !bbox) return null

  return (
    <>
      {/* Left — the editor tool panel, in place of the farm drawer */}
      <div className="absolute left-0 top-0 h-full z-[1100] shadow-xl">
        <FarmFieldEditorPanel
          mode={editor.mode}
          shape={editor.shape}
          name={editor.name}
          pointCount={editor.points.length}
          selectedPointIndex={editor.selectedPointIndex}
          rows={editor.rows}
          freePlants={editor.freePlants}
          selectedFreeCropId={editor.selectedFreeCropId}
          allFields={[]}
          selectedFieldId={session.editingFieldId}
          isCreatingNew={session.isCreatingNew}
          onShapeChange={editor.setShape}
          onNameChange={editor.setName}
          onStartNewField={() => {}}
          onStartDrawing={editor.startDrawing}
          onComplete={editor.completeDrawing}
          onUndo={editor.undoLastPoint}
          onSaveField={session.save}
          onCancelField={session.cancel}
          onDeletePoint={editor.deletePoint}
          onStartFillRows={editor.startFillRows}
          onStartAddRow={editor.startAddRow}
          onCancelAddRow={editor.cancelRowConfig}
          onStartAddFreePlant={editor.startAddFreePlant}
          onStopAddFreePlant={editor.stopAddFreePlant}
          onEditRows={(ids) => session.setEditingRowIds(ids)}
          onDeleteRows={(ids) => editor.deleteRows(ids)}
          onSelectField={() => {}}
          onEditFieldById={() => {}}
          onDeleteFieldById={() => {}}
          onRowSelectionChange={session.setHighlightedRowIds}
        />
      </div>

      {/* Right — contextual sub-panels over the map */}
      <div className="absolute inset-0 z-[1100] pointer-events-none [&>*]:pointer-events-auto">
        {editor.mode === 'rowConfig' && editor.rowDraft && (
          <RowConfigPanel
            rowDraft={editor.rowDraft}
            bbox={bbox}
            onConfirm={editor.confirmRow}
            onCancel={editor.cancelRowConfig}
          />
        )}

        {editor.mode === 'fillRows' && (
          <RowFillPanel
            boundary={session.editingBoundary}
            onPreview={editor.setFillPreviewRows}
            onConfirm={editor.confirmFillRows}
            onCancel={editor.cancelFillRows}
          />
        )}

        {session.editingRowIds && editor.mode === 'complete' && (() => {
          const editRows = editor.rows.filter(r => session.editingRowIds!.includes(r.id))
          if (editRows.length === 0) return null
          return (
            <RowEditPanel
              key={session.editingRowIds.join('|')}
              rows={editRows}
              boundary={session.editingBoundary}
              onApply={(updated) => { editor.applyRowEdits(updated); session.setEditingRowIds(null) }}
              onCancel={() => session.setEditingRowIds(null)}
            />
          )
        })()}

        {session.selectedPlantId && editor.mode === 'complete' && (() => {
          const plant =
            editor.rows.flatMap(r => r.plants).find(p => p.id === session.selectedPlantId)
            ?? editor.freePlants.find(p => p.id === session.selectedPlantId)
          if (!plant) return null
          return (
            <PlantEditPanel
              plant={plant}
              onChangeCrop={(cropId) => editor.updatePlantCrop(plant.id, cropId)}
              onDelete={(reason, notes) => session.removePlant(plant, reason, notes)}
              onClose={() => session.setSelectedPlantId(null)}
            />
          )
        })()}
      </div>
    </>
  )
}
