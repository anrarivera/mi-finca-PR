import { useCallback, useEffect, useState } from 'react'
import { X, Trash2, ClipboardList } from 'lucide-react'
import { useFieldEditor } from '../hooks/useFieldEditor'
import FieldEditorCanvas from './fieldEditorCanvas'
import FieldEditorPanel from './fieldEditorPanel'
import RowConfigPanel from './rowConfigPanel'
import OperationsView from './operationsView'
import { useFieldStore } from '@/store/useFieldStore'
import { randomFieldColor } from '../types'
import type { PlacedField } from '../types'

type Props = {
  farmId: string
  farmLat: number
  farmLng: number
  onClose: () => void
  onSaved?: (fieldId: string, isNew: boolean) => void
  editingFieldId?: string | null
}

export default function FieldEditor({
  farmId, farmLat, farmLng, onClose, onSaved, editingFieldId,
}: Props) {
  const editor = useFieldEditor()

  useEffect(() => {
  if (!editingFieldId) {
    editor.setFieldId(`field_${Date.now()}`)
  }
  }, [])
  
  const { addField, updateField, removeField, getField } = useFieldStore()
  const [showOperations, setShowOperations] = useState(false)

  useEffect(() => {
    if (!editingFieldId) return
    const existing = getField(editingFieldId)
    if (existing) {
      editor.loadField(existing)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFieldId])

  const handleSave = useCallback(() => {
    if (editor.points.length < 3 || !editor.name.trim()) return
    const CANVAS_W = 800
    const CANVAS_H = 600
    const normalized = editor.points.map(p => ({
      x: p.x / CANVAS_W,
      y: p.y / CANVAS_H,
    }))

    if (editingFieldId) {
      updateField(editingFieldId, {
        name: editor.name,
        shape: editor.shape,
        widthFt: editor.widthFt,
        heightFt: editor.heightFt,
        points: normalized,
        rows: editor.rows,
        freePlants: editor.freePlants,
        plantingEvents: editor.plantingEvents,
      })
      onSaved?.(editingFieldId, false)
    } else {
      const fieldId = `field_${Date.now()}`
      const newField: PlacedField = {
        id: fieldId,
        farmId,
        name: editor.name,
        color: randomFieldColor(),
        shape: editor.shape,
        widthFt: editor.widthFt,
        heightFt: editor.heightFt,
        points: normalized,
        farmLat,
        farmLng,
        rotation: 0,
        isPositioning: true,
        displayMode: 'shape',
        rows: editor.rows,
        freePlants: editor.freePlants,
        plantingEvents: editor.plantingEvents,
      }
      addField(newField)
      onSaved?.(fieldId, true)
    }
    onClose()
  }, [editor, farmId, farmLat, farmLng, editingFieldId, addField, updateField, onClose, onSaved])

  function handleDelete() {
    if (!editingFieldId) return
    if (window.confirm('¿Eliminar este campo?')) {
      removeField(editingFieldId)
      onClose()
    }
  }

  const hasCrops = editor.plantingEvents.length > 0

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-white">

      {/* Top bar */}
      <div className="h-12 bg-[#2d4a1e] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[#d4e8b0] font-semibold text-sm">
            {editingFieldId ? 'Editar campo' : 'Nuevo campo'}
          </span>
          {editor.name && (
            <>
              <span className="text-[#5a8a3a] text-sm">·</span>
              <span className="text-[#8fba4e] text-sm">{editor.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">

          {/* Operations button — only when crops exist */}
          {hasCrops && (
            <button
              onClick={() => setShowOperations(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[#8fba4e] hover:bg-white/10 transition-colors text-xs"
            >
              <ClipboardList size={13} />
              Operaciones
              {/* Badge for due operations */}
              {editor.plantingEvents.flatMap(e => e.operations).filter(o => o.status === 'due').length > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {editor.plantingEvents.flatMap(e => e.operations).filter(o => o.status === 'due').length}
                </span>
              )}
            </button>
          )}

          {editingFieldId && (
            <button onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-300 hover:bg-red-900/30 hover:text-red-200 transition-colors text-xs"
            >
              <Trash2 size={13} /> Eliminar campo
            </button>
          )}
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8fba4e] hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <FieldEditorPanel
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
          onShapeChange={editor.setShape}
          onNameChange={editor.setName}
          onWidthChange={editor.setWidthFt}
          onHeightChange={editor.setHeightFt}
          onStartDrawing={editor.startDrawing}
          onComplete={editor.completeDrawing}
          onUndo={editor.undoLastPoint}
          onClear={editor.clearDrawing}
          onSave={handleSave}
          onDeletePoint={editor.deletePoint}
          onStartAddRow={editor.startAddRow}
          onStartAddFreePlant={editor.startAddFreePlant}
          onStopAddFreePlant={editor.stopAddFreePlant}
          onDeleteRow={editor.deleteRow}
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
            onAddPoint={editor.addPoint}
            onSetRectangle={editor.setRectangle}
            onMovePoint={(index, p) => { if (index >= 0) editor.movePoint(index, p) }}
            onSelectPoint={(i) => editor.setSelectedPointIndex(i === -1 ? null : i)}
            onMouseMove={editor.setMousePos}
            onComplete={editor.completeDrawing}
            onRowClick={editor.handleRowClick}
            onPlaceFreePlant={editor.placeFreePlant}
            onDeleteFreePlant={editor.deleteFreePlant}
          />
          {editor.mode === 'rowConfig' && editor.rowDraft && (
            <RowConfigPanel
              rowDraft={editor.rowDraft}
              widthFt={editor.widthFt}
              heightFt={editor.heightFt}
              onConfirm={editor.confirmRow}
              onCancel={editor.cancelRowConfig}
            />
          )}
        </div>
      </div>

      {/* Operations view — slides over everything */}
      {showOperations && (
        <OperationsView
          plantingEvents={editor.plantingEvents}
          fieldName={editor.name}
          onClose={() => setShowOperations(false)}
          onCompleteOperation={editor.completeOperation}
          onSkipOperation={editor.skipOperation}
        />
      )}

    </div>
  )
}