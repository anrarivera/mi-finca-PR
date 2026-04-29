import { useState } from 'react'
import {
  Plus, Pencil, Check, Trash2, RotateCcw,
  Rows3, Leaf, ChevronDown, ChevronUp,
  Square, Pentagon, X, ClipboardList,
} from 'lucide-react'
import type { FieldShape, FieldRow, PlantInstance, PlacedField } from '../types'
import type { EditorMode } from '../hooks/useFieldEditor'
import CropSelector from './cropSelector'
import { getCropById } from '../data/cropLibrary'
import { computeCropSummary } from '../utils/rowCalculator'

type Props = {
  // Current editor state
  mode: EditorMode
  shape: FieldShape
  name: string
  widthFt: number
  heightFt: number
  pointCount: number
  selectedPointIndex: number | null
  rows: FieldRow[]
  freePlants: PlantInstance[]
  selectedFreeCropId: string
  isCreatingNew: boolean
  // All farm fields
  allFields: PlacedField[]
  selectedFieldId: string | null
  // Handlers
  onShapeChange: (s: FieldShape) => void
  onNameChange: (n: string) => void
  onWidthChange: (w: number) => void
  onHeightChange: (h: number) => void
  onStartNewField: () => void
  onStartDrawing: () => void
  onComplete: () => void
  onUndo: () => void
  onSaveField: () => void
  onCancelField: () => void
  onDeletePoint: (i: number) => void
  onStartAddRow: () => void
  onStartAddFreePlant: (cropId: string) => void
  onStopAddFreePlant: () => void
  onDeleteRow: (id: string) => void
  onSelectField: (id: string) => void
  onEditSelectedField: () => void
  onDeleteSelectedField: () => void
  onOpenOperations: () => void
}

export default function FarmFieldEditorPanel({
  mode, shape, name, widthFt, heightFt,
  pointCount, selectedPointIndex,
  rows, freePlants, selectedFreeCropId,
  allFields, selectedFieldId, isCreatingNew,
  onShapeChange, onNameChange, onWidthChange, onHeightChange,
  onStartNewField, onStartDrawing, onComplete, onUndo,
  onSaveField, onCancelField, onDeletePoint,
  onStartAddRow, onStartAddFreePlant, onStopAddFreePlant, onDeleteRow,
  onSelectField, onEditSelectedField, onDeleteSelectedField, onOpenOperations,
}: Props) {
  const [freeCropPick, setFreeCropPick] = useState('')
  const [showRows, setShowRows] = useState(true)

  const selectedField = allFields.find(f => f.id === selectedFieldId)
  const isIdle = mode === 'setup' && !selectedFieldId && !isCreatingNew
  const isEditingSelected = (mode !== 'setup' || isCreatingNew) && !isIdle

  // ── IDLE — show field list ────────────────────────────────────────
  if (isIdle) {
    return (
      <div className="w-64 h-full bg-white border-r border-[#e0e8d8] flex flex-col">
        <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] shrink-0">
          <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
            Campos de la finca
          </p>
          <p className="text-[10px] text-[#9aab8a] mt-0.5">
            {allFields.length} {allFields.length === 1 ? 'campo' : 'campos'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {allFields.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
              <Square size={24} className="text-[#c0d8a0]" strokeWidth={1.5} />
              <p className="text-xs text-[#9aab8a]">
                No hay campos todavía. Crea tu primer campo.
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[#f0f5e8]">
              {allFields.map(field => {
                const summary = computeCropSummary(
                  field.rows ?? [], field.freePlants ?? [], getCropById
                )
                return (
                  <button
                    key={field.id}
                    onClick={() => onSelectField(field.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-[#fafcf8] transition-colors ${
                      selectedFieldId === field.id ? 'bg-[#eaf3de]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: field.color }}
                      />
                      <span className="text-sm font-medium text-[#2d4a1e] truncate">
                        {field.name}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#9aab8a] mb-1">
                      {field.widthFt}ft × {field.heightFt}ft
                    </p>
                    {summary.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {summary.map(c => (
                          <div key={c.cropTypeId}
                            className="flex items-center gap-1 px-1.5 py-0.5 bg-[#f5f8f0] rounded"
                          >
                            <span className="text-xs">{c.emoji}</span>
                            <span className="text-[10px] text-[#5a6a4a] font-medium">{c.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#e0e8d8] shrink-0">
          <button
            onClick={onStartNewField}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
          >
            <Plus size={13} /> Nuevo campo
          </button>
        </div>
      </div>
    )
  }

  // ── FIELD SELECTED (not yet editing) ─────────────────────────────
  if (selectedField && mode === 'setup') {
    const summary = computeCropSummary(
      selectedField.rows ?? [], selectedField.freePlants ?? [], getCropById
    )
    const dueCount = (selectedField.plantingEvents ?? [])
      .flatMap(e => e.operations)
      .filter(o => o.status === 'due').length

    return (
      <div className="w-64 h-full bg-white border-r border-[#e0e8d8] flex flex-col">
        <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center gap-2 shrink-0">
          <button
            onClick={() => onSelectField('')}
            className="text-[#9aab8a] hover:text-[#2d4a1e] transition-colors"
          >
            ←
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: selectedField.color }}
            />
            <p className="text-xs font-semibold text-[#2d4a1e] truncate">
              {selectedField.name}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] text-[#9aab8a]">
              {selectedField.widthFt}ft × {selectedField.heightFt}ft
            </p>
            {selectedField.boundary && (
              <p className="text-[10px] text-[#9aab8a]">
                {selectedField.boundary.length} puntos de contorno
              </p>
            )}
          </div>

          {summary.length > 0 && (
            <div className="flex flex-col gap-1.5 px-3 py-2.5 bg-[#f5f8f0] rounded-lg">
              <p className="text-[10px] font-semibold text-[#5a6a4a] uppercase tracking-wide">
                Cultivos
              </p>
              <div className="flex flex-wrap gap-2">
                {summary.map(c => (
                  <div key={c.cropTypeId} className="flex items-center gap-1">
                    <span className="text-sm">{c.emoji}</span>
                    <span className="text-xs text-[#5a6a4a] font-medium">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={onEditSelectedField}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Pencil size={13} /> Editar campo
            </button>

            {summary.length > 0 && (
              <button
                onClick={onOpenOperations}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
              >
                <ClipboardList size={13} />
                Operaciones
                {dueCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {dueCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={onDeleteSelectedField}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={13} /> Eliminar campo
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-[#e0e8d8] shrink-0">
          <button
            onClick={onStartNewField}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
          >
            <Plus size={13} /> Nuevo campo
          </button>
        </div>
      </div>
    )
  }

  // ── DRAWING / EDITING A FIELD ─────────────────────────────────────
  return (
    <div className="w-64 h-full bg-white border-r border-[#e0e8d8] flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
            {selectedFieldId ? 'Editando campo' : 'Nuevo campo'}
          </p>
          <button onClick={onCancelField}
            className="text-[#9aab8a] hover:text-red-400 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">

        {/* Field name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">
            Nombre <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            placeholder="Ej. Campo de plátanos"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
          />
        </div>

        {/* ── SETUP mode ── */}
        {(mode === 'setup' || isCreatingNew) && !isIdle && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">Forma</label>
              <div className="grid grid-cols-2 gap-2">
                {(['rectangle', 'polygon'] as FieldShape[]).map(s => (
                  <button key={s} onClick={() => onShapeChange(s)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                      shape === s
                        ? 'bg-[#eaf3de] border-[#639922] text-[#2d4a1e]'
                        : 'border-[#e0e8d8] text-[#7a8a6a] hover:bg-[#f5f8f0]'
                    }`}
                  >
                    {s === 'rectangle'
                      ? <Square size={18} strokeWidth={1.5} />
                      : <Pentagon size={18} strokeWidth={1.5} />
                    }
                    {s === 'rectangle' ? 'Rectángulo' : 'Polígono'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">Dimensiones reales</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-[#9aab8a]">Ancho (ft)</span>
                  <input type="number" min={1} value={widthFt}
                    onChange={e => onWidthChange(Number(e.target.value))}
                    className="w-full px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-[#9aab8a]">Alto (ft)</span>
                  <input type="number" min={1} value={heightFt}
                    onChange={e => onHeightChange(Number(e.target.value))}
                    className="w-full px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
                  />
                </div>
              </div>
            </div>

            <button onClick={onStartDrawing} disabled={!name.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Pencil size={13} />
              {shape === 'rectangle' ? 'Dibujar rectángulo' : 'Dibujar polígono'}
            </button>
          </>
        )}

        {/* ── DRAWING mode ── */}
        {mode === 'drawing' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse shrink-0" />
              <span className="text-xs text-[#3b6d11] font-medium">
                {shape === 'rectangle'
                  ? 'Clic y arrastra para dibujar'
                  : `${pointCount} puntos colocados`}
              </span>
            </div>
            {shape === 'polygon' && (
              <div className="flex flex-col gap-1.5 text-xs text-[#7a8a6a] bg-[#f5f8f0] rounded-lg p-3">
                <p>• Clic para añadir puntos</p>
                <p>• Clic en primer punto para cerrar</p>
                <p>• Backspace para deshacer</p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {shape === 'polygon' && (
                <>
                  <button onClick={onComplete} disabled={pointCount < 3}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#639922] text-white rounded-lg text-xs font-medium hover:bg-[#3b6d11] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Check size={13} /> Completar forma
                  </button>
                  <button onClick={onUndo} disabled={pointCount === 0}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#7a8a6a] hover:bg-[#f5f8f0] rounded-lg transition-colors disabled:opacity-40"
                  >
                    <RotateCcw size={13} /> Deshacer último punto
                  </button>
                </>
              )}
              <button onClick={onCancelField}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} /> Cancelar
              </button>
            </div>
          </>
        )}

        {/* ── COMPLETE mode ── */}
        {mode === 'complete' && (
          <>
            {selectedPointIndex !== null && selectedPointIndex >= 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs text-red-600 font-medium">
                    Punto {selectedPointIndex + 1} seleccionado
                  </span>
                </div>
                <button onClick={() => onDeletePoint(selectedPointIndex)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Eliminar
                </button>
              </div>
            )}

            {/* Row list */}
            {rows.length > 0 && (
              <div className="flex flex-col gap-2">
                <button onClick={() => setShowRows(p => !p)}
                  className="flex items-center justify-between text-xs font-medium text-[#5a6a4a]"
                >
                  <span>Hileras ({rows.length})</span>
                  {showRows ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showRows && (
                  <div className="flex flex-col gap-1.5">
                    {rows.map((row, i) => {
                      const primary = getCropById(row.primaryCropTypeId)
                      const companion = row.companionCropTypeId
                        ? getCropById(row.companionCropTypeId) : null
                      return (
                        <div key={row.id}
                          className="flex items-center justify-between px-2.5 py-2 bg-white border border-[#e8f0e0] rounded-lg"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-[#9aab8a]">#{i + 1}</span>
                            <span className="text-sm">{primary?.emoji}</span>
                            {companion && (
                              <>
                                <span className="text-[10px] text-[#c0d0b0]">+</span>
                                <span className="text-sm">{companion.emoji}</span>
                              </>
                            )}
                            <span className="text-[10px] text-[#9aab8a]">
                              · {row.plants.length} plantas
                            </span>
                          </div>
                          <button onClick={() => onDeleteRow(row.id)}
                            className="text-[#c0d0b0] hover:text-red-400 transition-colors"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-[#f0f5e8]">
              <button onClick={onStartAddRow}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
              >
                <Rows3 size={13} /> Añadir hilera
              </button>

              <div className="flex flex-col gap-1.5">
                <CropSelector
                  value={freeCropPick}
                  onChange={setFreeCropPick}
                  placeholder="Elegir planta libre..."
                />
                <button
                  onClick={() => { if (freeCropPick) { onStartAddFreePlant(freeCropPick) } }}
                  disabled={!freeCropPick}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Leaf size={13} /> Colocar planta libre
                </button>
              </div>

              <div className="h-px bg-[#f0f5e8]" />

              <button onClick={onSaveField} disabled={!name.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={13} /> Guardar campo
              </button>
              <button onClick={onCancelField}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} /> Cancelar
              </button>
            </div>
          </>
        )}

        {/* ── ADD ROW mode ── */}
        {mode === 'addRow' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse shrink-0" />
              <span className="text-xs text-[#3b6d11] font-medium">Modo: dibujar hilera</span>
            </div>
            <div className="flex flex-col gap-1.5 text-xs text-[#7a8a6a] bg-[#f5f8f0] rounded-lg p-3">
              <p>• Clic para marcar inicio de hilera</p>
              <p>• Clic de nuevo para marcar el final</p>
            </div>
            <button onClick={onCancelField}
              className="w-full py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </>
        )}

        {/* ── ADD FREE PLANT mode ── */}
        {mode === 'addFreePlant' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse shrink-0" />
              <span className="text-xs text-[#3b6d11] font-medium">
                Haz clic en el campo para colocar plantas
              </span>
            </div>
            <button onClick={onStopAddFreePlant}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Check size={13} /> Terminar colocación
            </button>
          </>
        )}

      </div>
    </div>
  )
}