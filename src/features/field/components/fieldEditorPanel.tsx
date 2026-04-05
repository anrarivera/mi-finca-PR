import { Square, Pentagon, Pencil, Check, Trash2, RotateCcw } from 'lucide-react'
import type { FieldShape } from '../types'
import type { EditorMode } from '../hooks/useFieldEditor'

type Props = {
  mode: EditorMode
  shape: FieldShape
  name: string
  widthFt: number
  heightFt: number
  pointCount: number
  selectedPointIndex: number | null
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
}

export default function FieldEditorPanel({
  mode, shape, name, widthFt, heightFt,
  pointCount, selectedPointIndex,
  onShapeChange, onNameChange, onWidthChange, onHeightChange,
  onStartDrawing, onComplete, onUndo, onClear, onSave, onDeletePoint,
}: Props) {
  const canSave = mode === 'complete' && name.trim().length > 0

  return (
    <div className="w-64 h-full bg-white border-r border-[#e0e8d8] flex flex-col overflow-y-auto">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0]">
        <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
          Editor de Campo
        </p>
      </div>

      <div className="flex flex-col gap-4 p-4">

        {/* Field name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">
            Nombre del campo <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            placeholder="Ej. Campo de plátanos"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
          />
        </div>

        {/* Shape selector */}
        {mode === 'setup' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#5a6a4a]">Forma</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onShapeChange('rectangle')}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                  shape === 'rectangle'
                    ? 'bg-[#eaf3de] border-[#639922] text-[#2d4a1e]'
                    : 'border-[#e0e8d8] text-[#7a8a6a] hover:bg-[#f5f8f0]'
                }`}
              >
                <Square size={18} strokeWidth={1.5} />
                Rectángulo
              </button>
              <button
                onClick={() => onShapeChange('polygon')}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                  shape === 'polygon'
                    ? 'bg-[#eaf3de] border-[#639922] text-[#2d4a1e]'
                    : 'border-[#e0e8d8] text-[#7a8a6a] hover:bg-[#f5f8f0]'
                }`}
              >
                <Pentagon size={18} strokeWidth={1.5} />
                Polígono
              </button>
            </div>
          </div>
        )}

        {/* Dimensions */}
        {mode === 'setup' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#5a6a4a]">
              Dimensiones reales
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#9aab8a]">Ancho (ft)</span>
                <input
                  type="number"
                  min={1}
                  value={widthFt}
                  onChange={e => onWidthChange(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#9aab8a]">Alto (ft)</span>
                <input
                  type="number"
                  min={1}
                  value={heightFt}
                  onChange={e => onHeightChange(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
                />
              </div>
            </div>
            <p className="text-[10px] text-[#9aab8a] leading-relaxed">
              La cuadrícula se ajustará a escala según estas dimensiones.
            </p>
          </div>
        )}

        {/* Start drawing button */}
        {mode === 'setup' && (
          <button
            onClick={onStartDrawing}
            disabled={!name.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Pencil size={13} />
            {shape === 'rectangle' ? 'Dibujar rectángulo' : 'Dibujar polígono'}
          </button>
        )}

        {/* Drawing mode instructions */}
        {mode === 'drawing' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse shrink-0" />
              <span className="text-xs text-[#3b6d11] font-medium">
                {shape === 'rectangle'
                  ? 'Haz clic y arrastra para dibujar'
                  : `${pointCount} puntos colocados`
                }
              </span>
            </div>

            {shape === 'polygon' && (
              <div className="flex flex-col gap-1.5 text-xs text-[#7a8a6a] leading-relaxed bg-[#f5f8f0] rounded-lg p-3">
                <p>• Clic para añadir puntos</p>
                <p>• Clic en el primer punto para cerrar</p>
                <p>• Backspace para deshacer el último punto</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {shape === 'polygon' && (
                <>
                  <button
                    onClick={onComplete}
                    disabled={pointCount < 3}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#639922] text-white rounded-lg text-xs font-medium hover:bg-[#3b6d11] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Check size={13} />
                    Completar forma
                  </button>
                  <button
                    onClick={onUndo}
                    disabled={pointCount === 0}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#7a8a6a] hover:bg-[#f5f8f0] rounded-lg transition-colors disabled:opacity-40"
                  >
                    <RotateCcw size={13} />
                    Deshacer último punto
                  </button>
                </>
              )}
              <button
                onClick={onClear}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                Cancelar
              </button>
            </div>
          </>
        )}

        {/* Complete mode */}
        {mode === 'complete' && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-[#2d4a1e]">Campo listo</p>
              <p className="text-xs text-[#7a8a6a]">
                {widthFt}ft × {heightFt}ft · {pointCount} puntos
              </p>
            </div>

            {/* Selected point indicator */}
            {selectedPointIndex !== null && selectedPointIndex >= 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs text-red-600 font-medium">
                    Punto {selectedPointIndex + 1} seleccionado
                  </span>
                </div>
                <button
                  onClick={() => onDeletePoint(selectedPointIndex)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Eliminar
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1.5 text-xs text-[#7a8a6a] bg-[#f5f8f0] rounded-lg p-3">
              <p>• Arrastra puntos para moverlos</p>
              <p>• Clic en punto para seleccionar</p>
              <p>• Doble clic en el campo para añadir punto</p>
              <p>• Delete para eliminar punto seleccionado</p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={onSave}
                disabled={!canSave}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={13} />
                Guardar campo
              </button>
              <button
                onClick={onClear}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                Limpiar y empezar de nuevo
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}