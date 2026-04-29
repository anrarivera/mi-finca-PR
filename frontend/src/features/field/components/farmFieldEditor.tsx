import { useState, useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { useFieldEditor } from '../hooks/useFieldEditor'
import FieldEditorCanvas from './fieldEditorCanvas'
import FarmFieldEditorPanel from './farmFieldEditorPanel'
import RowConfigPanel from './rowConfigPanel'
import OperationsView from './operationsView'
import { useSatelliteBackground } from '../hooks/useSatelliteBackground'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore } from '@/store/useFarmStore'
import { randomFieldColor } from '../types'
import type { PlacedField } from '../types'

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
  const { fields, addField, updateField, removeField, getField, getFieldsByFarmId } = useFieldStore()
  const { farms, addFieldIdToFarm, removeFieldIdFromFarm } = useFarmStore()
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [showOperations, setShowOperations] = useState(false)
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  const activeFarm = farms.find(f => f.id === farmId)
  const farmBoundary = activeFarm?.boundary ?? []
  const farmFields = getFieldsByFarmId(farmId)

  const { bbox } = useSatelliteBackground(farmBoundary)

  // ── Start a new field from scratch ───────────────────────────────
  function handleStartNewField() {
    setSelectedFieldId(null)
    setEditingFieldId(null)
    setIsCreatingNew(true)
    editor.reset()
    editor.setFieldId(`field_${Date.now()}`)
  }

  // ── Select an existing field (shows its details in panel) ─────────
  function handleSelectField(id: string) {
    if (id === '') {
      setSelectedFieldId(null)
      return
    }
    // If currently drawing, don't allow field selection
    if (editor.mode !== 'setup') return
    setSelectedFieldId(id)
  }

  // ── Enter edit mode for the selected field ────────────────────────
  function handleEditSelectedField() {
    if (!selectedFieldId || !bbox) return
    const field = getField(selectedFieldId)
    if (!field) return
    setEditingFieldId(selectedFieldId)
    editor.loadField(field, bbox)
  }

  // ── Delete the selected field ─────────────────────────────────────
  function handleDeleteSelectedField() {
    if (!selectedFieldId) return
    if (!window.confirm('¿Eliminar este campo?')) return
    removeField(selectedFieldId)
    removeFieldIdFromFarm(farmId, selectedFieldId)
    onFieldDeleted(selectedFieldId)
    setSelectedFieldId(null)
  }

  // ── Cancel current drawing / editing ─────────────────────────────
  function handleCancelField() {
    editor.reset()
    setEditingFieldId(null)
    setSelectedFieldId(null)
    setIsCreatingNew(false)
  }

  // ── Save the current field ────────────────────────────────────────
  const handleSaveField = useCallback(() => {
    if (editor.points.length < 3 || !editor.name.trim() || !bbox) return

    const boundaryLatLng = editor.canvasPointsToLatLng(bbox)

    if (editingFieldId) {
      // Update existing
      updateField(editingFieldId, {
        name: editor.name,
        shape: editor.shape,
        widthFt: editor.widthFt,
        heightFt: editor.heightFt,
        boundary: boundaryLatLng,
        rows: editor.rows,
        freePlants: editor.freePlants,
        plantingEvents: editor.plantingEvents,
      })
      onFieldSaved(editingFieldId, false)
      // Stay in the editor — go back to showing this field selected
      setSelectedFieldId(editingFieldId)
      setEditingFieldId(null)
      setIsCreatingNew(false)
      editor.reset()
    } else {
      // Create new
      const fieldId = editor.fieldId || `field_${Date.now()}`
      const newField: PlacedField = {
        id: fieldId,
        farmId,
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
        displayMode: 'shape',
        rows: editor.rows,
        freePlants: editor.freePlants,
        plantingEvents: editor.plantingEvents,
      }
      addField(newField)
      addFieldIdToFarm(farmId, fieldId)
      onFieldSaved(fieldId, true)
      // Stay in editor — select the newly created field
      setSelectedFieldId(fieldId)
      setIsCreatingNew(false)
      editor.reset()
    }
  }, [editor, bbox, farmId, editingFieldId, addField, updateField, onFieldSaved, addFieldIdToFarm, removeFieldIdFromFarm])

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
          onStartAddRow={editor.startAddRow}
          onStartAddFreePlant={editor.startAddFreePlant}
          onStopAddFreePlant={editor.stopAddFreePlant}
          onDeleteRow={editor.deleteRow}
          onSelectField={handleSelectField}
          onEditSelectedField={handleEditSelectedField}
          onDeleteSelectedField={handleDeleteSelectedField}
          onOpenOperations={() => setShowOperations(true)}
          isCreatingNew={isCreatingNew}
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
            rowStartPoint={editor.rowStartPoint}
            selectedFreeCropId={editor.selectedFreeCropId}
            bbox={bbox}
            farmBoundary={farmBoundary}
            // Pass all saved fields so the canvas can render them
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
            onDeleteFreePlant={editor.deleteFreePlant}
            onClickField={handleSelectField}
          />

          {editor.mode === 'rowConfig' && editor.rowDraft && bbox && (
            <RowConfigPanel
              rowDraft={editor.rowDraft}
              bbox={bbox}
              onConfirm={editor.confirmRow}
              onCancel={editor.cancelRowConfig}
            />
          )}
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