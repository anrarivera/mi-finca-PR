import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Check, Milestone, Plus, Sprout, Undo2, X } from 'lucide-react'
import { useIsPhone } from '@/hooks/useViewport'
import type { DrawingMode } from '../hooks/useDrawing'
import { fmtNumber } from '@/i18n'

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
  /** Owner-only action — hidden for admins (the server rejects them). */
  canDeleteFarm?: boolean
  /** True while the user's ONLY farm has no boundary yet — first-farm
      onboarding. The boundary card then starts expanded so a new user
      doesn't have to discover the small FAB; once dismissed (or once
      there are more farms / a saved boundary) it stays collapsed. */
  firstFarm?: boolean
  /** Boundary saved but the farm has no fields yet — show the
      "create your first field" follow-up card. */
  promptFirstField?: boolean
  /** Bumped by the host right after "Añadir finca" creates a farm —
      opens the boundary card so drawing is the immediate next step,
      for every new farm (not just the first). */
  openCardNonce?: number
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
  canDeleteFarm = true,
  firstFarm = false,
  promptFirstField = false,
  openCardNonce = 0,
}: Props) {
  const { t } = useTranslation('farm')
  const isPhone = useIsPhone()
  const [menuOpen, setMenuOpen] = useState(false)
  // Boundary onboarding card — starts open during first-farm onboarding,
  // and re-opens every time a farm is created (openCardNonce) so drawing
  // the boundary is always the in-your-face next step after "Añadir
  // finca". Closes on dismiss or by drawing; only shows while there is
  // no boundary (mode 'idle').
  const [cardOpen, setCardOpen] = useState(firstFarm)
  // Render-time adjustment (same idiom as prevMode below): a new nonce
  // means a farm was just created — pop the card open.
  const [seenNonce, setSeenNonce] = useState(openCardNonce)
  if (openCardNonce !== seenNonce) {
    setSeenNonce(openCardNonce)
    if (openCardNonce > 0) setCardOpen(true)
  }
  const active = mode === 'drawing' || mode === 'editing'
  const showOnboard = mode === 'idle' && cardOpen

  // Second onboarding moment: boundary saved but the farm has no fields
  // yet. Without this the trail went cold after "Finca guardada" — the
  // only path to crops was the subtle drawer tab. Session-dismissable;
  // yields to the action menu when that is open.
  const [fieldCardOpen, setFieldCardOpen] = useState(true)
  const showFieldOnboard =
    mode === 'complete' && promptFirstField && fieldCardOpen && !menuOpen

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
      {/* Tap-outside closes the action menu. The onboarding card gets NO
          backdrop on purpose: the user needs to pan/zoom the map to find
          their land while it's open — it only closes explicitly ("Ahora
          no", the FAB, or starting to draw). */}
      {menuOpen && (
        <div
          className="absolute inset-0 z-[999]"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="absolute right-4 top-4 z-[1000] flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {/* Onboarding chip until the first boundary exists (the expanded
              first-farm card replaces it); acreage after */}
          {mode === 'idle' ? (
            !showOnboard && (
              <button
                onClick={onStart}
                className="px-2.5 py-1.5 bg-white border border-[#e0e8d8] rounded-full shadow-md text-[11px] font-medium text-[#2d4a1e]"
              >
                {t('drawing.drawYourFarm')}
              </button>
            )
          ) : areaAcres !== null && (
            <span className="px-2.5 py-1.5 bg-white border border-[#e0e8d8] rounded-full shadow-md text-[11px] font-medium text-[#5a6a4a]">
              {t('acresShort', { value: fmtNumber(areaAcres) })}
            </span>
          )}
          <button
            onClick={() => {
              if (mode !== 'idle') { setMenuOpen(open => !open); return }
              // Card showing → collapse it. First farm re-opens it on the
              // next click; veterans go straight into drawing, as before.
              if (cardOpen) setCardOpen(false)
              else if (firstFarm) setCardOpen(true)
              else onStart()
            }}
            title={t('drawing.boundaryTitle')}
            aria-label={t('drawing.boundaryTitle')}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[#2d4a1e] text-[#d4e8b0] shadow-lg hover:bg-[#3d6128] transition-colors"
          >
            <Milestone size={18} />
          </button>
        </div>

        {/* ── First-farm onboarding card — expanded by default ── */}
        {showOnboard && (
          <div className="w-64 bg-white rounded-xl border border-[#e0e8d8] shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center gap-2">
              <Milestone size={14} className="text-[#639922]" />
              <span className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
                {t('drawing.boundaryTitle')}
              </span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-[#5a6a4a] leading-relaxed">
                {t('drawing.onboardBody')}
              </p>
              <button
                onClick={onStart}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
              >
                <Pencil size={13} />
                {t('drawing.onboardStart')}
              </button>
              <button
                onClick={() => setCardOpen(false)}
                className="w-full py-1.5 text-xs text-[#9aab8a] hover:text-[#5a6a4a] hover:bg-[#f5f8f0] rounded-lg transition-colors"
              >
                {t('drawing.onboardLater')}
              </button>
            </div>
          </div>
        )}

        {/* ── First-field onboarding card — boundary saved, no fields ── */}
        {showFieldOnboard && (
          <div className="w-64 bg-white rounded-xl border border-[#e0e8d8] shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center gap-2">
              <Sprout size={14} className="text-[#639922]" />
              <span className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
                {t('drawing.fieldOnboardTitle')}
              </span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-[#5a6a4a] leading-relaxed">
                {t('drawing.fieldOnboardBody')}
              </p>
              <button
                onClick={() => { setFieldCardOpen(false); onAddField() }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
              >
                <Plus size={13} />
                {t('drawing.fieldOnboardStart')}
              </button>
              <button
                onClick={() => setFieldCardOpen(false)}
                className="w-full py-1.5 text-xs text-[#9aab8a] hover:text-[#5a6a4a] hover:bg-[#f5f8f0] rounded-lg transition-colors"
              >
                {t('drawing.onboardLater')}
              </button>
            </div>
          </div>
        )}

        {/* ── Boundary action menu (complete mode) ── */}
        {menuOpen && mode === 'complete' && (
          <div className="w-56 bg-white rounded-xl border border-[#e0e8d8] shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0]">
              <div className="flex items-center gap-2">
                <Milestone size={14} className="text-[#639922]" />
                <span className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
                  {t('drawing.boundaryTitle')}
                </span>
              </div>
              {areaAcres !== null && (
                <div className="flex items-baseline gap-1 mt-1.5">
                  <span className="text-2xl font-bold text-[#2d4a1e]">{areaAcres}</span>
                  <span className="text-xs text-[#7a8a6a]">{t('drawing.acresPoints', { count: pointCount })}</span>
                </div>
              )}
            </div>

            <div className="p-3 flex flex-col gap-2">
              <button
                onClick={() => { setMenuOpen(false); onSave() }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
              >
                <Check size={13} />
                {t('drawing.saveFarm')}
              </button>
              <button
                onClick={onStartEditing}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] hover:bg-[#eaf3de] rounded-lg transition-colors"
              >
                <Pencil size={13} />
                {t('drawing.editBoundary')}
              </button>
              <button
                onClick={onClear}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                {t('drawing.clearRedraw')}
              </button>
              {canDeleteFarm && (
              <button
                onClick={() => { setMenuOpen(false); onDeleteFarm() }}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                {t('drawing.deleteFarm')}
              </button>
              )}
              <div className="h-px bg-[#f0f5e8]" />
              <button
                onClick={() => { setMenuOpen(false); onAddField() }}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#639922] hover:bg-[#eaf3de] rounded-lg transition-colors"
              >
                <Plus size={13} />
                {t('drawing.manageFields')}
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
  const { t } = useTranslation('farm')
  const status =
    mode === 'drawing'
      ? pointCount === 0
        ? t('drawing.tapToPlace')
        : t('drawing.pointCount', { count: pointCount })
      : selectedPointIndex !== null
      ? t('drawing.pointSelected', { number: selectedPointIndex + 1 })
      : `${areaAcres !== null ? `${t('acresShort', { value: fmtNumber(areaAcres) })} · ` : ''}${t('drawing.tapPointToEdit')}`

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
            label={t('drawing.undo')} icon={<Undo2 size={15} />} isPhone={isPhone}
            onClick={onUndoPoint} disabled={pointCount === 0}
          />
          <ToolbarButton
            label={t('drawing.cancel')} icon={<X size={15} />} isPhone={isPhone}
            onClick={onClear} tone="danger"
          />
          <ToolbarButton
            label={t('drawing.complete')} icon={<Check size={15} />} isPhone={isPhone}
            onClick={onComplete} disabled={pointCount < 3} tone="primary"
          />
        </>
      ) : (
        <>
          {selectedPointIndex !== null && (
            <>
              <ToolbarButton
                label={t('drawing.addPoint')} icon={<Plus size={15} />} isPhone={isPhone}
                onClick={onInsertPointAfterSelected}
              />
              <ToolbarButton
                label={t('drawing.deletePoint')} icon={<Trash2 size={15} />} isPhone={isPhone}
                onClick={onDeleteSelectedPoint} tone="danger"
              />
            </>
          )}
          <ToolbarButton
            label={t('drawing.finish')} icon={<Check size={15} />} isPhone={isPhone}
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
