import { useCallback, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { useFieldEditor } from '../hooks/useFieldEditor'
import FieldEditorCanvas from './fieldEditorCanvas'
import FieldEditorPanel from './fieldEditorPanel'
import RowConfigPanel from './rowConfigPanel'
import { useFieldStore } from '@/store/useFieldStore'
import { randomFieldColor } from '../types'
import type { PlacedField } from '../types'

type Props = {
  farmLat: number
  farmLng: number
  onClose: () => void
  editingFieldId?: string | null
}

export default function FieldEditor({ farmLat, farmLng, onClose, editingFieldId }: Props) {
  const editor = useFieldEditor()
  const { addField, updateField, removeField, getField } = useFieldStore()

  useEffect(() => {
    if (!editingFieldId) return
    const existing = getField(editingFieldId)
    if (existing) editor.loadField(existing)
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
      })
    } else {
      const newField: PlacedField = {
        id: `field_${Date.now()}`,
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
      }
      addField(newField)
    }
    onClose()
  }, [editor, farmLat, farmLng, editingFieldId, addField, updateField, onClose])

  function handleDelete() {
    if (!editingFieldId) return
    if (window.confirm('¿Eliminar este campo?')) {
      removeField(editingFieldId)
      onClose()
    }
  }

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

        {/* Canvas + row config panel */}
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
            onMovePoint={(index, p) => {
              if (index >= 0) editor.movePoint(index, p)
            }}
            onSelectPoint={(i) => {
              editor.setSelectedPointIndex(i === -1 ? null : i)
            }}
            onMouseMove={editor.setMousePos}
            onComplete={editor.completeDrawing}
            onRowClick={editor.handleRowClick}
            onPlaceFreePlant={editor.placeFreePlant}
            onDeleteFreePlant={editor.deleteFreePlant}
          />

          {/* Row config panel — appears after row is drawn */}
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
    </div>
  )
}