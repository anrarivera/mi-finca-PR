import { useState } from 'react'
import { Pencil, Trash2, Check, Milestone, Plus, Undo2, X } from 'lucide-react'
import { useIsPhone } from '@/hooks/useViewport'
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
  onAddField: () => void
  onDeleteFarm: () => void
  /** On-screen equivalents of the Backspace/Delete shortcuts — the only
      path to these actions on touch. */
  onUndoPoint: () => void
  onDeleteSelectedPoint: () => void
  /** Touch path for the dblclick vertex insertion — adds a point after
      the selected vertex. */
  onInsertPointAfterSelected: () => void
}

// ──────────────────────────────────────────────────────────────────────────
// Farm-boundary tools. Two faces instead of a permanent card:
//  - idle/complete → a small FAB in the top-right corner; tapping it starts
//    drawing (no boundary yet) or opens the boundary action menu. The map
//    stays uncovered the rest of the time.
//  - drawing/editing → a slim toolbar: bottom-docked on phones (thumb reach,
//    map fully visible above), top-right on desktop.
// Completing a shape auto-opens the menu so "Guardar finca" is the obvious
// next step.
// ──────────────────────────────────────────────────────────────────────────

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
  onAddField,
  onDeleteFarm,
  onUndoPoint,
  onDeleteSelectedPoint,
  onInsertPointAfterSelected,
}: Props) {
  const isPhone = useIsPhone()
  const [menuOpen, setMenuOpen] = useState(false)
  const active = mode === 'drawing' || mode === 'editing'

  // Finishing a draw/edit lands in 'complete' — surface the menu so the
  // save action is in the user's face instead of hidden behind the FAB.
  // Only on those transitions: a saved boundary loading on mount also
  // arrives at 'complete' (idle→complete) and must NOT pop the menu.
  const [prevMode, setPrevMode] = useState(mode)
  if (mode !== prevMode) {
    setPrevMode(mode)
    const cameFromActive = prevMode === 'drawing' || prevMode === 'editing'
    if (cameFromActive && mode === 'complete') setMenuOpen(true)
    if (mode !== 'complete') setMenuOpen(false)
  }

  if (active) {
    return (
      <Toolbar
        mode={mode}
        isPhone={isPhone}
        pointCount={pointCount}
        areaAcres={areaAcres}
        selectedPointIndex={selectedPointIndex}
        onUndoPoint={onUndoPoint}
        onComplete={onComplete}
        onClear={onClear}
        onDeleteSelectedPoint={onDeleteSelectedPoint}
        onInsertPointAfterSelected={onInsertPointAfterSelected}
        onFinishEditing={onFinishEditing}
      />
    )
  }

  return (
    <>
      {/* Tap-outside closes the menu */}
      {menuOpen && (
        <div
          className="absolute inset-0 z-[999]"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="absolute right-4 top-4 z-[1000] flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {/* Onboarding chip until the first boundary exists; acreage after */}
          {mode === 'idle' ? (
            <button
              onClick={onStart}
              className="px-2.5 py-1.5 bg-white border border-[#e0e8d8] rounded-full shadow-md text-[11px] font-medium text-[#2d4a1e]"
            >
              Dibuja tu finca
            </button>
          ) : areaAcres !== null && (
            <span className="px-2.5 py-1.5 bg-white border border-[#e0e8d8] rounded-full shadow-md text-[11px] font-medium text-[#5a6a4a]">
              {areaAcres} ac
            </span>
          )}
          <button
            onClick={() => (mode === 'idle' ? onStart() : setMenuOpen(open => !open))}
            title="Límite de finca"
            aria-label="Límite de finca"
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[#2d4a1e] text-[#d4e8b0] shadow-lg hover:bg-[#3d6128] transition-colors"
          >
            <Milestone size={18} />
          </button>
        </div>

        {/* ── Boundary action menu (complete mode) ── */}
        {menuOpen && mode === 'complete' && (
          <div className="w-56 bg-white rounded-xl border border-[#e0e8d8] shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0]">
              <div className="flex items-center gap-2">
                <Milestone size={14} className="text-[#639922]" />
                <span className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
                  Límite de finca
                </span>
              </div>
              {areaAcres !== null && (
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="text-2xl font-bold text-[#2d4a1e]">{areaAcres}</span>
                  <span className="text-xs text-[#7a8a6a]">acres · {pointCount} puntos</span>
                </div>
              )}
            </div>

            <div className="p-3 flex flex-col gap-2">
              <button
                onClick={() => { setMenuOpen(false); onSave() }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
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
              <button
                onClick={() => { setMenuOpen(false); onDeleteFarm() }}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                Eliminar finca
              </button>
              <div className="h-px bg-[#f0f5e8]" />
              <button
                onClick={() => { setMenuOpen(false); onAddField() }}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] hover:bg-[#eaf3de] rounded-lg transition-colors"
              >
                <Plus size={13} />
                Gestionar campos
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Active-mode toolbar ──────────────────────────────────────────────
function Toolbar({
  mode, isPhone, pointCount, areaAcres, selectedPointIndex,
  onUndoPoint, onComplete, onClear, onDeleteSelectedPoint,
  onInsertPointAfterSelected, onFinishEditing,
}: {
  mode: 'drawing' | 'editing'
  isPhone: boolean
  pointCount: number
  areaAcres: number | null
  selectedPointIndex: number | null
  onUndoPoint: () => void
  onComplete: () => void
  onClear: () => void
  onDeleteSelectedPoint: () => void
  onInsertPointAfterSelected: () => void
  onFinishEditing: () => void
}) {
  const status =
    mode === 'drawing'
      ? pointCount === 0
        ? 'Toca el mapa para colocar esquinas'
        : `${pointCount} ${pointCount === 1 ? 'punto' : 'puntos'}`
      : selectedPointIndex !== null
      ? `Punto ${selectedPointIndex + 1} seleccionado`
      : `${areaAcres !== null ? `${areaAcres} ac · ` : ''}toca un punto para editarlo`

  return (
    <div
      className={
        isPhone
          ? 'absolute bottom-0 inset-x-0 z-[1000] bg-white border-t border-[#e0e8d8] px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-1.5'
          : 'absolute top-4 right-4 z-[1000] bg-white rounded-xl border border-[#e0e8d8] shadow-lg px-3 py-2 flex items-center gap-1.5'
      }
    >
      <div className="flex items-center gap-2 flex-1 min-w-0 pr-1">
        <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse shrink-0" />
        <span className="text-xs text-[#5a6a4a] font-medium truncate">{status}</span>
      </div>

      {mode === 'drawing' ? (
        <>
          <ToolbarButton
            label="Deshacer" icon={<Undo2 size={15} />} isPhone={isPhone}
            onClick={onUndoPoint} disabled={pointCount === 0}
          />
          <ToolbarButton
            label="Cancelar" icon={<X size={15} />} isPhone={isPhone}
            onClick={onClear} tone="danger"
          />
          <ToolbarButton
            label="Completar" icon={<Check size={15} />} isPhone={isPhone}
            onClick={onComplete} disabled={pointCount < 3} tone="primary"
          />
        </>
      ) : (
        <>
          {selectedPointIndex !== null && (
            <>
              <ToolbarButton
                label="Añadir punto" icon={<Plus size={15} />} isPhone={isPhone}
                onClick={onInsertPointAfterSelected}
              />
              <ToolbarButton
                label="Eliminar punto" icon={<Trash2 size={15} />} isPhone={isPhone}
                onClick={onDeleteSelectedPoint} tone="danger"
              />
            </>
          )}
          <ToolbarButton
            label="Terminar" icon={<Check size={15} />} isPhone={isPhone}
            onClick={onFinishEditing} tone="primary"
          />
        </>
      )}
    </div>
  )
}

function ToolbarButton({
  label, icon, isPhone, onClick, disabled = false, tone = 'neutral',
}: {
  label: string
  icon: React.ReactNode
  isPhone: boolean
  onClick: () => void
  disabled?: boolean
  tone?: 'neutral' | 'primary' | 'danger'
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-[#639922] text-white hover:bg-[#3b6d11]'
      : tone === 'danger'
      ? 'text-[#9aab8a] hover:text-red-500 hover:bg-red-50'
      : 'text-[#639922] hover:bg-[#eaf3de]'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`shrink-0 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        isPhone ? 'w-11 h-11' : 'px-3 py-2'
      } ${toneClass}`}
    >
      {icon}
      {!isPhone && label}
    </button>
  )
}
