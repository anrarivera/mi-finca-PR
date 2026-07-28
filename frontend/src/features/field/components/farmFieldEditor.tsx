import { useState, useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useFieldEditor } from '../hooks/useFieldEditor'
import FieldEditorCanvas from './fieldEditorCanvas'
import FarmFieldEditorPanel from './farmFieldEditorPanel'
import RowConfigPanel from './rowConfigPanel'
import RowFillPanel from './rowFillPanel'
import RowEditPanel from './rowEditPanel'
import PlantEditPanel from './plantEditPanel'
import { useSatelliteBackground } from '../hooks/useSatelliteBackground'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore } from '@/store/useFarmStore'
import { randomFieldColor } from '../types'
import { useCreateField, useDeleteField, useUpdateField } from '../hooks/useFieldsApi'
import { useCreateOperation } from '../hooks/useOperationsApi'
import { getCropById } from '../data/cropLibrary'
import { REMOVAL_REASONS, type PlantRemovalReason } from './plantEditPanel'
import { toast } from '@/store/useToastStore'

// A plant removal waiting to be written to the operations log. Queued while
// editing and flushed on save — cancelling the edit discards them together
// with the removal itself.
type PendingRemovalLog = {
  plantId: string
  cropTypeId: string
  reason: PlantRemovalReason
  notes?: string
}

type Props = {
  farmId: string
  /** Open the editor already editing this field (map/drawer double-click). */
  initialFieldId?: string | null
  onClose: () => void
  onFieldSaved: (fieldId: string, isNew: boolean) => void
  onFieldDeleted: (fieldId: string) => void
}

export default function FarmFieldEditor({
  farmId, initialFieldId, onClose, onFieldSaved, onFieldDeleted,
}: Props) {
  const editor = useFieldEditor()
  const { getField, getFieldsByFarmId } = useFieldStore()
  const { farms, addFieldIdToFarm, removeFieldIdFromFarm } = useFarmStore()
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [editingRowIds, setEditingRowIds] = useState<string[] | null>(null)
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null)
  const [removalLogs, setRemovalLogs] = useState<PendingRemovalLog[]>([])

  const activeFarm = farms.find(f => f.id === farmId)
  const farmBoundary = activeFarm?.boundary ?? []
  const farmFields = getFieldsByFarmId(farmId)

  const { bbox } = useSatelliteBackground(farmBoundary)
  const createField = useCreateField(farmId)
  const updateField_api = useUpdateField(farmId)
  const deleteField = useDeleteField(farmId)
  const createOperation = useCreateOperation(farmId)

  // The boundary of the field currently being edited (for row fill/edit panels)
  const editingBoundary = bbox
    ? (editingFieldId
        ? (getField(editingFieldId)?.boundary ?? editor.canvasPointsToLatLng(bbox))
        : editor.canvasPointsToLatLng(bbox))
    : []

  // ── Start a new field from scratch ───────────────────────────────
  function handleStartNewField() {
    setSelectedFieldId(null)
    setEditingFieldId(null)
    setIsCreatingNew(true)
    setEditingRowIds(null)
    setSelectedPlantId(null)
    editor.reset()
    editor.setFieldId(`field_${Date.now()}`)
  }

  // ── Select an existing field ──────────────────────────────────────
  function handleSelectField(id: string) {
    if (id === '') {
      setSelectedFieldId(null)
      return
    }
    if (editor.mode !== 'setup') return
    setSelectedFieldId(id)
  }

  // ── Enter edit mode for a field (card double-click / Editar button) ──
  function handleEditField(id: string) {
    if (!bbox) return
    const field = getField(id)
    if (!field) return
    setSelectedFieldId(id)
    setEditingFieldId(id)
    setIsCreatingNew(false)
    setEditingRowIds(null)
    setSelectedPlantId(null)
    editor.loadField(field, bbox)
  }

  // Opened via double-click on the map or a drawer card: jump straight
  // into editing that field once the canvas bbox is ready. Ref-guarded so
  // it fires exactly once per mount.
  const initialApplied = useRef(false)
  useEffect(() => {
    if (!initialFieldId || initialApplied.current || !bbox) return
    initialApplied.current = true
    handleEditField(initialFieldId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFieldId, bbox])

  // ── Delete a field (card already confirmed) ───────────────────────
  function handleDeleteField(id: string) {
    deleteField.mutate(id, {
      onSuccess: () => {
        removeFieldIdFromFarm(farmId, id)
        onFieldDeleted(id)
        if (selectedFieldId === id) setSelectedFieldId(null)
        toast.success('Campo eliminado')
      },
    })
  }

  // ── Cancel current drawing / editing ─────────────────────────────
  function handleCancelField() {
    editor.reset()
    setEditingFieldId(null)
    setSelectedFieldId(null)
    setIsCreatingNew(false)
    setEditingRowIds(null)
    setSelectedPlantId(null)
    setRemovalLogs([]) // removals were discarded along with the edit
  }

  // ── Flush queued plant-removal logs after a successful save ────────
  // Each removal becomes an operations-log entry: harvested removals log
  // as 'harvest', everything else as 'other', always naming the crop and
  // the reason so the history explains itself.
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

  // ── Click a saved field on the canvas → open it for editing ───────
  // ('' means the canvas asked to clear the selection.)
  function handleCanvasFieldClick(id: string) {
    if (id === '') {
      setSelectedFieldId(null)
      return
    }
    if (editor.mode !== 'setup' || isCreatingNew) return // busy editing/drawing
    handleEditField(id)
  }

  // ── Escape backs out one level at a time ──────────────────────────
  // Open sub-panel/mode first (plant panel, row panel, row drawing, fill,
  // free plants…), then the edit/draw session itself — landing back on the
  // field-cards page.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (selectedPlantId) { setSelectedPlantId(null); return }
      if (editingRowIds) { setEditingRowIds(null); return }
      switch (editor.mode) {
        case 'rowConfig':
        case 'addRow':
          editor.cancelRowConfig()
          return
        case 'fillRows':
          editor.cancelFillRows()
          return
        case 'addFreePlant':
          editor.stopAddFreePlant()
          return
        case 'drawing':
        case 'complete':
          handleCancelField()
          return
        case 'setup':
          // Creating a new field but not drawing yet — cancel the form too
          if (isCreatingNew) handleCancelField()
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.mode, selectedPlantId, editingRowIds, isCreatingNew])

  // ── Save the current field ────────────────────────────────────────
  const handleSaveField = useCallback(async () => {
    if (editor.points.length < 3 || !editor.name.trim() || !bbox) return

    const boundaryLatLng = editor.canvasPointsToLatLng(bbox)

    if (editingFieldId) {
      const updates = {
        name: editor.name,
        shape: editor.shape,
        boundary: boundaryLatLng,
        rows: editor.rows,
        freePlants: editor.freePlants,
        plantingEvents: editor.plantingEvents,
      }
      await updateField_api.mutateAsync({ id: editingFieldId, updates })
      await flushRemovalLogs(editingFieldId) // plant removals → operations log
      onFieldSaved(editingFieldId, false)
      setSelectedFieldId(editingFieldId)
      setEditingFieldId(null)
      setIsCreatingNew(false)
      setEditingRowIds(null)
      setSelectedPlantId(null)
      toast.success('Campo actualizado')
      editor.reset()
    } else {
      const payload = {
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
      }
      const saved = await createField.mutateAsync(payload)
      addFieldIdToFarm(farmId, saved.id)
      onFieldSaved(saved.id, true)
      setSelectedFieldId(saved.id)
      setIsCreatingNew(false)
      setEditingRowIds(null)
      setSelectedPlantId(null)
      toast.success('Campo guardado')
      editor.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, bbox, farmId, editingFieldId, createField, updateField_api, onFieldSaved, addFieldIdToFarm, removalLogs, createOperation])

  const isActivelyDrawing = editor.mode !== 'setup'
  const activeFieldId = editingFieldId || (isActivelyDrawing ? editor.fieldId : null)

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-white">

      {/* Top bar */}
      <div className="h-12 bg-[#2d4a1e] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[#d4e8b0] font-semibold text-sm">
            Editor de campos — {activeFarm?.name}
          </span>
          {isActivelyDrawing && editor.name && (
            <>
              <span className="text-[#5a8a3a] text-sm">·</span>
              <span className="text-[#8fba4e] text-sm">
                {editingFieldId ? 'Editando' : 'Nuevo'}: {editor.name}
              </span>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8fba4e] hover:bg-white/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        <FarmFieldEditorPanel
          mode={editor.mode}
          shape={editor.shape}
          name={editor.name}
          pointCount={editor.points.length}
          selectedPointIndex={editor.selectedPointIndex}
          rows={editor.rows}
          freePlants={editor.freePlants}
          selectedFreeCropId={editor.selectedFreeCropId}
          allFields={farmFields}
          selectedFieldId={selectedFieldId}
          isCreatingNew={isCreatingNew}
          onShapeChange={editor.setShape}
          onNameChange={editor.setName}
          onStartNewField={handleStartNewField}
          onStartDrawing={editor.startDrawing}
          onComplete={editor.completeDrawing}
          onUndo={editor.undoLastPoint}
          onSaveField={handleSaveField}
          onCancelField={handleCancelField}
          onDeletePoint={editor.deletePoint}
          onStartFillRows={editor.startFillRows}
          onStartAddRow={editor.startAddRow}
          onCancelAddRow={editor.cancelRowConfig}
          onStartAddFreePlant={editor.startAddFreePlant}
          onStopAddFreePlant={editor.stopAddFreePlant}
          onEditRows={(ids) => setEditingRowIds(ids)}
          onDeleteRows={(ids) => editor.deleteRows(ids)}
          onSelectField={handleSelectField}
          onEditFieldById={handleEditField}
          onDeleteFieldById={handleDeleteField}
        />

        <div className="flex-1 overflow-hidden relative">
          <FieldEditorCanvas
            shape={editor.shape}
            mode={editor.mode}
            points={editor.points}
            mousePos={editor.mousePos}
            selectedPointIndex={editor.selectedPointIndex}
            rows={editor.rows}
            freePlants={editor.freePlants}
            fillPreviewRows={editor.fillPreviewRows}
            rowStartPoint={editor.rowStartPoint}
            selectedFreeCropId={editor.selectedFreeCropId}
            bbox={bbox}
            farmBoundary={farmBoundary}
            savedFields={farmFields}
            activeFieldId={activeFieldId}
            selectedFieldId={selectedFieldId}
            onAddPoint={editor.addPoint}
            onSetRectangle={editor.setRectangle}
            onMovePoint={(index, p) => { if (index >= 0) editor.movePoint(index, p) }}
            onSelectPoint={i => editor.setSelectedPointIndex(i === -1 ? null : i)}
            onMouseMove={editor.setMousePos}
            onComplete={editor.completeDrawing}
            onRowClick={editor.handleRowClick}
            onPlaceFreePlant={editor.placeFreePlant}
            onClickField={handleCanvasFieldClick}
            selectedRowId={editingRowIds?.length === 1 ? editingRowIds[0] : null}
            selectedPlantId={selectedPlantId}
            onSelectRow={(id) => { setSelectedPlantId(null); setEditingRowIds([id]) }}
            onSelectPlant={(id) => { setEditingRowIds(null); setSelectedPlantId(id) }}
            onMoveRow={editor.translateRow}
          />

          {/* Row config panel — single row between two clicked points */}
          {editor.mode === 'rowConfig' && editor.rowDraft && bbox && (
            <RowConfigPanel
              rowDraft={editor.rowDraft}
              bbox={bbox}
              onConfirm={editor.confirmRow}
              onCancel={editor.cancelRowConfig}
            />
          )}

          {/* Fill rows panel — multi-row fill tool */}
          {editor.mode === 'fillRows' && bbox && (
            <RowFillPanel
              boundary={editingBoundary}
              onPreview={editor.setFillPreviewRows}
              onConfirm={editor.confirmFillRows}
              onCancel={editor.cancelFillRows}
            />
          )}

          {/* Row edit panel — single or bulk row editing */}
          {editingRowIds && bbox && editor.mode === 'complete' && (() => {
            const editRows = editor.rows.filter(r => editingRowIds.includes(r.id))
            if (editRows.length === 0) return null
            return (
              <RowEditPanel
                key={editingRowIds.join('|')}
                rows={editRows}
                boundary={editingBoundary}
                onApply={(updated) => { editor.applyRowEdits(updated); setEditingRowIds(null) }}
                onCancel={() => setEditingRowIds(null)}
              />
            )
          })()}

          {/* Plant edit panel — click a plant on the canvas */}
          {selectedPlantId && editor.mode === 'complete' && (() => {
            const plant =
              editor.rows.flatMap(r => r.plants).find(p => p.id === selectedPlantId)
              ?? editor.freePlants.find(p => p.id === selectedPlantId)
            if (!plant) return null
            return (
              <PlantEditPanel
                plant={plant}
                onChangeCrop={(cropId) => editor.updatePlantCrop(plant.id, cropId)}
                onDelete={(reason, notes) => {
                  // Queue the "why" for the operations log — flushed when the
                  // field is saved. New unsaved fields skip logging (removing
                  // a plant you just placed isn't a farm event).
                  if (editingFieldId) {
                    setRemovalLogs(prev => [...prev, {
                      plantId: plant.id,
                      cropTypeId: plant.cropTypeId,
                      reason,
                      notes,
                    }])
                  }
                  editor.deletePlantById(plant.id)
                  setSelectedPlantId(null)
                }}
                onClose={() => setSelectedPlantId(null)}
              />
            )
          })()}
        </div>
      </div>

    </div>
  )
}