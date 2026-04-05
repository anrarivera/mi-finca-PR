import { useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { useFieldEditor } from '../hooks/useFieldEditor'
import FieldEditorCanvas from './fieldEditorCanvas'
import FieldEditorPanel from './fieldEditorPanel'
import { useFieldStore } from '@/store/useFieldStore'
import { randomFieldColor } from '../types'
import type { PlacedField } from '../types'

type Props = {
  farmLat: number
  farmLng: number
  onClose: () => void
  editingFieldId?: string | null
}

export default function FieldEditor({
  farmLat,
  farmLng,
  onClose,
  editingFieldId,
}: Props) {
  const editor = useFieldEditor()
  const { addField, updateField, getField } = useFieldStore()

  // ── Load existing field data when editing ───────────────────────────
  useEffect(() => {
    if (!editingFieldId) return
    const existing = getField(editingFieldId)
    if (existing) {
      editor.loadField(existing)
    }
  // Only run on mount — eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFieldId])

  const handleSave = useCallback(() => {
    if (editor.points.length < 3 || !editor.name.trim()) return

    const CANVAS_W = 800
    const CANVAS_H = 600

    // Normalize points back to 0-1 range
    const normalized = editor.points.map(p => ({
      x: p.x / CANVAS_W,
      y: p.y / CANVAS_H,
    }))

    if (editingFieldId) {
      // Update existing field — preserve farmLat, farmLng, color, rotation
      updateField(editingFieldId, {
        name: editor.name,
        shape: editor.shape,
        widthFt: editor.widthFt,
        heightFt: editor.heightFt,
        points: normalized,
      })
    } else {
      // Create new field
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
      }
      addField(newField)
    }

    onClose()
  }, [
    editor,
    farmLat, farmLng,
    editingFieldId,
    addField, updateField,
    onClose,
  ])

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
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8fba4e] hover:bg-white/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <FieldEditorPanel
          mode={editor.mode}
          shape={editor.shape}
          name={editor.name}
          widthFt={editor.widthFt}
          heightFt={editor.heightFt}
          pointCount={editor.points.length}
          selectedPointIndex={editor.selectedPointIndex}
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
        />

        {/* Canvas */}
        <div className="flex-1 overflow-hidden relative">
          <FieldEditorCanvas
            shape={editor.shape}
            mode={editor.mode}
            points={editor.points}
            mousePos={editor.mousePos}
            selectedPointIndex={editor.selectedPointIndex}
            widthFt={editor.widthFt}
            heightFt={editor.heightFt}
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
          />
        </div>

      </div>
    </div>
  )
}