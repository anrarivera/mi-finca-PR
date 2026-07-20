import { useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { useFieldEditor } from '../hooks/useFieldEditor'
import FieldEditorCanvas from './fieldEditorCanvas'
import FarmFieldEditorPanel from './farmFieldEditorPanel'
import RowConfigPanel from './rowConfigPanel'
import RowFillPanel from './rowFillPanel'
import RowEditPanel from './rowEditPanel'
import PlantEditPanel from './plantEditPanel'
import OperationsView from './operationsView'
import { useSatelliteBackground } from '../hooks/useSatelliteBackground'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore } from '@/store/useFarmStore'
import { randomFieldColor } from '../types'
import { useCreateField, useDeleteField, useUpdateField } from '../hooks/useFieldsApi'

type Props = {
  farmId: string
  onClose: () => void
  onFieldSaved: (fieldId: string, isNew: boolean) => void
  onFieldDeleted: (fieldId: string) => void
}

export default function FarmFieldEditor({
  farmId, onClose, onFieldSaved, onFieldDeleted,
}: Props) {
  const editor = useFieldEditor()
  const { updateField, removeField, getField, getFieldsByFarmId } = useFieldStore()
  const { farms, addFieldIdToFarm, removeFieldIdFromFarm } = useFarmStore()
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [showOperations, setShowOperations] = useState(false)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [editingRowIds, setEditingRowIds] = useState<string[] | null>(null)
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null)

  const activeFarm = farms.find(f => f.id === farmId)
  const farmBoundary = activeFarm?.boundary ?? []
  const farmFields = getFieldsByFarmId(farmId)

  const { bbox } = useSatelliteBackground(farmBoundary)
  const createField = useCreateField(farmId)
  const updateField_api = useUpdateField(farmId)
  const deleteField = useDeleteField(farmId)

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

  // ── Enter edit mode for the selected field ────────────────────────
  function handleEditSelectedField() {
    if (!selectedFieldId || !bbox) return
    const field = getField(selectedFieldId)
    if (!field) return
    setEditingFieldId(selectedFieldId)
    setEditingRowIds(null)
    setSelectedPlantId(null)
    editor.loadField(field, bbox)
  }

  // ── Delete the selected field ─────────────────────────────────────
  function handleDeleteSelectedField() {
    if (!selectedFieldId) return
    if (!window.confirm('¿Eliminar este campo?')) return
    deleteField.mutate(selectedFieldId, {
      onSuccess: () => {
        removeFieldIdFromFarm(farmId, selectedFieldId)
        onFieldDeleted(selectedFieldId)
        setSelectedFieldId(null)
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
  }

  // ── Save the current field ────────────────────────────────────────
  const handleSaveField = useCallback(async () => {
    if (editor.points.length < 3 || !editor.name.trim() || !bbox) return

    const boundaryLatLng = editor.canvasPointsToLatLng(bbox)

    if (editingFieldId) {
      const updates = {
        name: editor.name,
        shape: editor.shape,
        widthFt: editor.widthFt,
        heightFt: editor.heightFt,
        boundary: boundaryLatLng,
        rows: editor.rows,
        freePlants: editor.freePlants,
        plantingEvents: editor.plantingEvents,
      }
      await updateField_api.mutateAsync({ id: editingFieldId, updates })
      onFieldSaved(editingFieldId, false)
      setSelectedFieldId(editingFieldId)
      setEditingFieldId(null)
      setIsCreatingNew(false)
      setEditingRowIds(null)
      setSelectedPlantId(null)
      editor.reset()
    } else {
      const payload = {
        name: editor.name,
        color: randomFieldColor(),
        shape: editor.shape,
        widthFt: editor.widthFt,
        heightFt: editor.heightFt,
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
      editor.reset()
    }
  }, [editor, bbox, farmId, editingFieldId, createField, updateField_api, onFieldSaved, addFieldIdToFarm])

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
          widthFt={editor.widthFt}
          heightFt={editor.heightFt}
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
          onWidthChange={editor.setWidthFt}
          onHeightChange={editor.setHeightFt}
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
          onEditSelectedField={handleEditSelectedField}
          onDeleteSelectedField={handleDeleteSelectedField}
          onOpenOperations={() => setShowOperations(true)}
        />

        <div className="flex-1 overflow-hidden relative">
          <FieldEditorCanvas
            shape={editor.shape}
            mode={editor.mode}
            points={editor.points}
            mousePos={editor.mousePos}
            selectedPointIndex={editor.selectedPointIndex}
            widthFt={editor.widthFt}
            heightFt={editor.heightFt}
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
            onClickField={handleSelectField}
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
                onDelete={() => { editor.deletePlantById(plant.id); setSelectedPlantId(null) }}
                onClose={() => setSelectedPlantId(null)}
              />
            )
          })()}
        </div>
      </div>

      {/* Operations view */}
      {showOperations && selectedFieldId && (() => {
        const field = getField(selectedFieldId)
        if (!field) return null
        return (
          <OperationsView
            plantingEvents={field.plantingEvents ?? []}
            fieldName={field.name}
            onClose={() => setShowOperations(false)}
            onCompleteOperation={(eventId, opId, data) => {
              const updated = (field.plantingEvents ?? []).map(e =>
                e.id !== eventId ? e : {
                  ...e,
                  operations: e.operations.map(op =>
                    op.id !== opId ? op : { ...op, status: 'completed' as const, ...data }
                  )
                }
              )
              updateField(selectedFieldId, { plantingEvents: updated })
            }}
            onSkipOperation={(eventId, opId) => {
              const updated = (field.plantingEvents ?? []).map(e =>
                e.id !== eventId ? e : {
                  ...e,
                  operations: e.operations.map(op =>
                    op.id !== opId ? op : { ...op, status: 'skipped' as const }
                  )
                }
              )
              updateField(selectedFieldId, { plantingEvents: updated })
            }}
          />
        )
      })()}

    </div>
  )
}