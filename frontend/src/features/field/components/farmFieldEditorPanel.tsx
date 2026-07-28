import { useEffect, useState } from 'react'
import {
  Plus, Pencil, Check, Trash2, RotateCcw,
  Leaf, ChevronDown, ChevronUp,
  Square, Pentagon, X,
  LayoutGrid,
} from 'lucide-react'
import type { FieldShape, FieldRow, PlantInstance, PlacedField } from '../types'
import type { EditorMode } from '../hooks/useFieldEditor'
import CropSelector from './cropSelector'
import FieldSummaryCard from './fieldSummaryCard'
import { getCropById } from '../data/cropLibrary'

type Props = {
  mode: EditorMode
  shape: FieldShape
  name: string
  pointCount: number
  selectedPointIndex: number | null
  rows: FieldRow[]
  freePlants: PlantInstance[]
  selectedFreeCropId: string
  isCreatingNew: boolean
  allFields: PlacedField[]
  selectedFieldId: string | null
  onShapeChange: (s: FieldShape) => void
  onNameChange: (n: string) => void
  onStartNewField: () => void
  onStartDrawing: () => void
  onComplete: () => void
  onUndo: () => void
  onSaveField: () => void
  onCancelField: () => void
  onDeletePoint: (i: number) => void
  onStartFillRows: () => void
  onStartAddRow: () => void
  onCancelAddRow: () => void
  onStartAddFreePlant: (cropId: string) => void
  onStopAddFreePlant: () => void
  onEditRows: (ids: string[]) => void
  onDeleteRows: (ids: string[]) => void
  onSelectField: (id: string) => void
  /** Card double-click / Editar button — enter edit mode for this field. */
  onEditFieldById: (id: string) => void
  /** Card delete (already confirmed in-card). */
  onDeleteFieldById: (id: string) => void
  /** Fires whenever the row checkboxes change — highlights rows on the map. */
  onRowSelectionChange?: (ids: string[]) => void
}

export default function FarmFieldEditorPanel({
  mode, shape, name,
  pointCount, selectedPointIndex,
  rows,
  allFields, selectedFieldId, isCreatingNew,
  onShapeChange, onNameChange,
  onStartNewField, onStartDrawing, onComplete, onUndo,
  onSaveField, onCancelField, onDeletePoint,
  onStartFillRows, onStartAddRow, onCancelAddRow,
  onStartAddFreePlant, onStopAddFreePlant,
  onEditRows, onDeleteRows,
  onSelectField, onEditFieldById, onDeleteFieldById,
  onRowSelectionChange,
}: Props) {
  const [freeCropPick, setFreeCropPick] = useState('')
  const [showRows, setShowRows] = useState(true)
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([])

  // Mirror the checkbox selection up so the map can highlight those rows.
  useEffect(() => {
    onRowSelectionChange?.(selectedRowIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRowIds])
  const toggleRowSelected = (id: string) =>
    setSelectedRowIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const clearRowSelection = () => setSelectedRowIds([])

  const isIdle = mode === 'setup' && !isCreatingNew

  // ── SETUP — field summary cards (same cards as the farm-map drawer).
  //    Single click selects on the canvas, double click / "Editar" enters
  //    edit mode, and each card carries its own Operaciones button. ──────
  if (isIdle) {
    return (
      <div className="w-72 h-full bg-white border-r border-[#e0e8d8] flex flex-col">
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
              {allFields.map(field => (
                <FieldSummaryCard
                  key={field.id}
                  field={field}
                  focused={field.id === selectedFieldId}
                  onSelect={() => onSelectField(field.id)}
                  onOpenEditor={() => onEditFieldById(field.id)}
                  onDelete={() => onDeleteFieldById(field.id)}
                />
              ))}
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

            {rows.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <button onClick={() => setShowRows(p => !p)}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#5a6a4a]"
                  >
                    <span>Hileras ({rows.length})</span>
                    {showRows ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showRows && (
                    <button
                      onClick={() => setSelectedRowIds(
                        selectedRowIds.length === rows.length ? [] : rows.map(r => r.id)
                      )}
                      className="text-[10px] text-[#639922] hover:text-[#2d4a1e] transition-colors"
                    >
                      {selectedRowIds.length === rows.length ? 'Ninguno' : 'Todos'}
                    </button>
                  )}
                </div>

                {showRows && selectedRowIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => onEditRows(selectedRowIds)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
                    >
                      <Pencil size={10} /> Editar ({selectedRowIds.length})
                    </button>
                    <button onClick={() => { onDeleteRows(selectedRowIds); clearRowSelection() }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#9aab8a] border border-[#e0e8d8] rounded-lg hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={10} /> Eliminar ({selectedRowIds.length})
                    </button>
                  </div>
                )}

                {showRows && (
                  <div className="flex flex-col gap-1.5">
                    {rows.map((row, i) => {
                      const primary = getCropById(row.primaryCropTypeId)
                      const companion = row.companionCropTypeId
                        ? getCropById(row.companionCropTypeId) : null
                      const checked = selectedRowIds.includes(row.id)
                      return (
                        <div key={row.id}
                          className={`flex items-center gap-2 px-2.5 py-2 bg-white border rounded-lg transition-colors ${
                            checked ? 'border-[#639922] bg-[#f5f8f0]' : 'border-[#e8f0e0]'
                          }`}
                        >
                          <button onClick={() => toggleRowSelected(row.id)}
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              checked ? 'bg-[#639922] border-[#639922]' : 'border-[#c0d0b0] hover:border-[#639922]'
                            }`}
                          >
                            {checked && <Check size={10} className="text-white" />}
                          </button>

                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="text-xs text-[#9aab8a]">#{i + 1}</span>
                            <span className="text-sm">{primary?.emoji}</span>
                            {companion && (
                              <>
                                <span className="text-[10px] text-[#c0d0b0]">+</span>
                                <span className="text-sm">{companion.emoji}</span>
                              </>
                            )}
                            <span className="text-[10px] text-[#9aab8a] truncate">
                              · {row.plants.length} plantas
                            </span>
                          </div>

                          <button onClick={() => onEditRows([row.id])}
                            className="text-[#c0d0b0] hover:text-[#639922] transition-colors shrink-0"
                            title="Editar hilera"
                          >
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => { onDeleteRows([row.id]); setSelectedRowIds(prev => prev.filter(x => x !== row.id)) }}
                            className="text-[#c0d0b0] hover:text-red-400 transition-colors shrink-0"
                            title="Eliminar hilera"
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
              <button onClick={onStartFillRows}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
              >
                <LayoutGrid size={13} /> Rellenar con hileras
              </button>

              <button onClick={onStartAddRow}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
              >
                <Plus size={13} /> Añadir hilera individual
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
            <button onClick={onCancelAddRow}
              className="w-full py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </>
        )}

        {/* ── FILL ROWS mode ── */}
        {mode === 'fillRows' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
            <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse shrink-0" />
            <span className="text-xs text-[#3b6d11] font-medium">
              Ajusta el relleno en el panel de la derecha
            </span>
          </div>
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