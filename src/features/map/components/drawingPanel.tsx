import { Pencil, Trash2, Check, Milestone, MoveUpRight, MousePointer, Plus } from 'lucide-react'
import type { DrawingMode } from '../hooks/useDrawing'

type Props = {
  mode: DrawingMode
  pointCount: number
  areaAcres: number | null
  selectedPointIndex: number | null
  onStart: () => void
  onComplete: () => void
  onClear: () => void
  onStartEditing: () => void
  onFinishEditing: () => void
  onSave: () => void
  onAddField: () => void    // ← add this
  onDeleteFarm: () => void
}

export default function DrawingPanel({
  mode,
  pointCount,
  areaAcres,
  selectedPointIndex,
  onStart,
  onComplete,
  onClear,
  onStartEditing,
  onFinishEditing,
  onSave,
  onAddField,    // ← add this
  onDeleteFarm,
}: Props) {
  return (
    <div className="absolute right-4 top-4 z-[1000] w-56 bg-white rounded-xl border border-[#e0e8d8] shadow-lg overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0]">
        <div className="flex items-center gap-2">
          <Milestone size={14} className="text-[#639922]" />
          <span className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
            Límite de finca
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">

        {/* ── IDLE ── */}
        {mode === 'idle' && (
          <>
            <p className="text-xs text-[#7a8a6a] leading-relaxed">
              Dibuja el contorno exterior de tu finca haciendo clic en el mapa para colocar cada esquina.
            </p>
            <button
              onClick={onStart}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Pencil size={13} />
              Dibujar finca
            </button>
          </>
        )}

        {/* ── DRAWING ── */}
        {mode === 'drawing' && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-[#2d4a1e]">Modo dibujo activo</p>
              <p className="text-xs text-[#7a8a6a] leading-relaxed">
                Clic para añadir puntos. Backspace para deshacer el último punto.
              </p>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse" />
              <span className="text-xs text-[#3b6d11] font-medium">
                {pointCount} {pointCount === 1 ? 'punto' : 'puntos'} colocados
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={onComplete}
                disabled={pointCount < 3}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#639922] text-white rounded-lg text-xs font-medium hover:bg-[#3b6d11] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={13} />
                Completar forma
              </button>
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

        {/* ── COMPLETE ── */}
        {mode === 'complete' && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-[#2d4a1e]">Finca delimitada</p>
              {areaAcres !== null && (
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-[#2d4a1e]">{areaAcres}</span>
                  <span className="text-xs text-[#7a8a6a]">acres</span>
                </div>
              )}
              <p className="text-xs text-[#9aab8a] mt-1">
                {pointCount} puntos de contorno
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={onSave}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
              >
                <Check size={13} />
                Guardar finca
              </button>
              <button
                onClick={onStartEditing}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] hover:bg-[#eaf3de] rounded-lg transition-colors"
              >
                <Pencil size={13} />
                Editar límite
              </button>
              <button
                onClick={onClear}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                Limpiar y redibujar
              </button>
              <div className="h-px bg-[#f0f5e8]" />
              <button
                onClick={onDeleteFarm}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                Eliminar finca
              </button>
              <button
                onClick={onAddField}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] hover:bg-[#eaf3de] rounded-lg transition-colors"
              >
                <Plus size={13} />
                Añadir campo
              </button>
            </div>
          </>
        )}

        {/* ── EDITING ── */}
        {mode === 'editing' && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-[#2d4a1e]">Modo edición</p>
              {areaAcres !== null && (
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold text-[#2d4a1e]">{areaAcres}</span>
                  <span className="text-xs text-[#7a8a6a]">acres</span>
                </div>
              )}
            </div>

            {/* Context instructions */}
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2 px-3 py-2 bg-[#f5f8f0] rounded-lg">
                <MousePointer size={11} className="text-[#639922] mt-0.5 shrink-0" />
                <p className="text-xs text-[#5a6a4a] leading-relaxed">
                  <span className="font-medium">Arrastrar punto</span> — mueve una esquina
                </p>
              </div>
              <div className="flex items-start gap-2 px-3 py-2 bg-[#f5f8f0] rounded-lg">
                <MousePointer size={11} className="text-[#639922] mt-0.5 shrink-0" />
                <p className="text-xs text-[#5a6a4a] leading-relaxed">
                  <span className="font-medium">Clic en punto</span> — selecciona (Delete para eliminar, Esc para cancelar)
                </p>
              </div>
              <div className="flex items-start gap-2 px-3 py-2 bg-[#f5f8f0] rounded-lg">
                <MoveUpRight size={11} className="text-[#639922] mt-0.5 shrink-0" />
                <p className="text-xs text-[#5a6a4a] leading-relaxed">
                  <span className="font-medium">Doble clic en mapa</span> — añade punto en el borde más cercano
                </p>
              </div>
            </div>

            {/* Selected point indicator */}
            {selectedPointIndex !== null && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-xs text-red-600 font-medium">
                  Punto {selectedPointIndex + 1} seleccionado — presiona Delete para eliminar
                </span>
              </div>
            )}

            <button
              onClick={onFinishEditing}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Check size={13} />
              Terminar edición
            </button>
          </>
        )}

      </div>
    </div>
  )
}