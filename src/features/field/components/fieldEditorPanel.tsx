import { useState } from 'react'
import {
  Square, Pentagon, Pencil, Check, Trash2,
  RotateCcw, Rows3, Leaf, ChevronDown, ChevronUp, X
} from 'lucide-react'
import type { FieldShape, FieldRow } from '../types'
import type { EditorMode } from '../hooks/useFieldEditor'
import CropSelector from './cropSelector'
import { getCropById } from '../data/cropLibrary'
import { computeCropSummary } from '../utils/rowCalculator'
import type { PlantInstance } from '../types'

type Props = {
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
  onShapeChange: (s: FieldShape) => void
  onNameChange: (n: string) => void
  onWidthChange: (w: number) => void
  onHeightChange: (h: number) => void
  onStartDrawing: () => void
  onComplete: () => void
  onUndo: () => void
  onClear: () => void
  onSave: () => void
  onDeletePoint: (i: number) => void
  onStartAddRow: () => void
  onStartAddFreePlant: (cropId: string) => void
  onStopAddFreePlant: () => void
  onDeleteRow: (id: string) => void
}

export default function FieldEditorPanel({
  mode, shape, name, widthFt, heightFt,
  pointCount, selectedPointIndex,
  rows, freePlants, selectedFreeCropId,
  onShapeChange, onNameChange, onWidthChange, onHeightChange,
  onStartDrawing, onComplete, onUndo, onClear, onSave,
  onDeletePoint, onStartAddRow, onStartAddFreePlant,
  onStopAddFreePlant, onDeleteRow,
}: Props) {
  const [freeCropPick, setFreeCropPick] = useState('')
  const [showRows, setShowRows] = useState(true)
  const canSave = mode === 'complete' && name.trim().length > 0

  const cropSummary = computeCropSummary(rows, freePlants, getCropById)
  const totalPlants = cropSummary.reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="w-64 h-full bg-white border-r border-[#e0e8d8] flex flex-col overflow-y-auto">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] shrink-0">
        <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
          Editor de Campo
        </p>
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
        {mode === 'setup' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">Forma</label>
              <div className="grid grid-cols-2 gap-2">
                {(['rectangle', 'polygon'] as FieldShape[]).map(s => (
                  <button
                    key={s}
                    onClick={() => onShapeChange(s)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                      shape === s
                        ? 'bg-[#eaf3de] border-[#639922] text-[#2d4a1e]'
                        : 'border-[#e0e8d8] text-[#7a8a6a] hover:bg-[#f5f8f0]'
                    }`}
                  >
                    {s === 'rectangle' ? <Square size={18} strokeWidth={1.5} /> : <Pentagon size={18} strokeWidth={1.5} />}
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

            <button
              onClick={onStartDrawing}
              disabled={!name.trim()}
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
                {shape === 'rectangle' ? 'Clic y arrastra para dibujar' : `${pointCount} puntos colocados`}
              </span>
            </div>
            {shape === 'polygon' && (
              <div className="flex flex-col gap-1.5 text-xs text-[#7a8a6a] leading-relaxed bg-[#f5f8f0] rounded-lg p-3">
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
              <button onClick={onClear}
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
              <span className="text-xs text-[#3b6d11] font-medium">
                Modo: dibujar hilera
              </span>
            </div>
            <div className="flex flex-col gap-1.5 text-xs text-[#7a8a6a] leading-relaxed bg-[#f5f8f0] rounded-lg p-3">
              <p>• Haz clic en el canvas para marcar el inicio de la hilera</p>
              <p>• Haz clic de nuevo para marcar el final</p>
            </div>
            <button onClick={onClear}
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
            <p className="text-xs text-[#7a8a6a]">
              Cada clic coloca una planta. Haz clic en "Terminar" cuando hayas terminado.
            </p>
            <button onClick={onStopAddFreePlant}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Check size={13} /> Terminar colocación
            </button>
          </>
        )}

        {/* ── COMPLETE mode ── */}
        {mode === 'complete' && (
          <>
            {/* Boundary info */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-[#2d4a1e]">Límite del campo</p>
                <p className="text-[10px] text-[#9aab8a]">
                  {widthFt}ft × {heightFt}ft · {pointCount} puntos
                </p>
              </div>
            </div>

            {/* Selected point */}
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

            {/* Crop summary */}
            {cropSummary.length > 0 && (
              <div className="flex flex-col gap-2 px-3 py-2.5 bg-[#f5f8f0] rounded-lg">
                <p className="text-[10px] font-semibold text-[#5a6a4a] uppercase tracking-wide">
                  Cultivos · {totalPlants} plantas
                </p>
                <div className="flex flex-wrap gap-2">
                  {cropSummary.map(c => (
                    <div key={c.cropTypeId} className="flex items-center gap-1">
                      <span className="text-sm">{c.emoji}</span>
                      <span className="text-xs text-[#5a6a4a] font-medium">{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rows list */}
            {rows.length > 0 && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowRows(p => !p)}
                  className="flex items-center justify-between text-xs font-medium text-[#5a6a4a]"
                >
                  <span>Hileras ({rows.length})</span>
                  {showRows ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showRows && (
                  <div className="flex flex-col gap-1.5">
                    {rows.map((row, i) => {
                      const primary = getCropById(row.primaryCropTypeId)
                      const companion = row.companionCropTypeId ? getCropById(row.companionCropTypeId) : null
                      return (
                        <div key={row.id} className="flex items-center justify-between px-2.5 py-2 bg-white border border-[#e8f0e0] rounded-lg">
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

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-2 border-t border-[#f0f5e8]">

              {/* Add row */}
              <button onClick={onStartAddRow}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
              >
                <Rows3 size={13} />
                Añadir hilera
              </button>

              {/* Add free plant */}
              <div className="flex flex-col gap-1.5">
                <CropSelector
                  value={freeCropPick}
                  onChange={setFreeCropPick}
                  placeholder="Elegir planta libre..."
                />
                <button
                  onClick={() => { if (freeCropPick) onStartAddFreePlant(freeCropPick) }}
                  disabled={!freeCropPick}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Leaf size={13} />
                  Colocar planta libre
                </button>
              </div>

              <div className="h-px bg-[#f0f5e8]" />

              <button onClick={onSave} disabled={!canSave}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={13} /> Guardar campo
              </button>
              <button onClick={onClear}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} /> Limpiar y empezar de nuevo
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}