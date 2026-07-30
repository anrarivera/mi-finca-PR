import { useEffect, useRef, useState } from 'react'
import {
  MapPin, Layers, Pencil, Trash2,
  ToggleLeft, ToggleRight, AlertCircle, Clock, CalendarDays, Bug,
} from 'lucide-react'
import FindingModal from '@/features/scouting/components/findingModal'
import { computeCropSummary } from '../utils/rowCalculator'
import { getFieldOperationHealth } from '../utils/operationStatus'
import { getCropById } from '../data/cropLibrary'
import {
  areaFt2, ft2ToAcres, getCanvasScale, latlngToCanvas, farmBoundaryToBBox,
} from '../utils/canvasGeo'
import { CheckOffModal, harvestTargetsForOperation } from './operationsView'
import FieldOperationsContainer from './fieldOperationsContainer'
import {
  useCompleteRecommendedOp, useSkipRecommendedOp, useLogPartialRecommendedOp,
} from '../hooks/useOperationsApi'
import { toast } from '@/store/useToastStore'
import type { PlacedField, PlantingEvent, RecommendedOperation } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Field summary card — the ONE card used everywhere fields are listed (farm
// drawer on the map, field editor's left panel). Self-contained: it owns
// its check-off modal, the full operations UI, and the delete confirmation,
// so hosts only provide selection/editor callbacks.
// Interactions: single click selects, double click opens the field editor
// for this field, and the action row offers Operaciones / Editar / Eliminar.
// ──────────────────────────────────────────────────────────────────────────

// The most urgent open calendar item for a field: overdue first (oldest
// first), then upcoming (soonest first). Drives the check-off shortcut.
export function nextOperation(field: PlacedField): {
  op: RecommendedOperation
  event: PlantingEvent
} | null {
  const open = (field.plantingEvents ?? []).flatMap(event =>
    event.operations
      .filter(op => op.status === 'due' || op.status === 'pending')
      .map(op => ({ op, event }))
  )
  if (open.length === 0) return null
  open.sort((a, b) => {
    if (a.op.status !== b.op.status) return a.op.status === 'due' ? -1 : 1
    return a.op.recommendedDate.localeCompare(b.op.recommendedDate)
  })
  return open[0]
}

type Props = {
  field: PlacedField
  /** Highlight + scroll into view (map selection / editor selection). */
  focused?: boolean
  /** Re-triggers the scroll when the same field is focused again. */
  focusNonce?: number
  /** Single click on the card. */
  onSelect?: () => void
  /** The "Editar" button — and the card double click unless overridden. */
  onOpenEditor: () => void
  /** Overrides the card double click (e.g. the farm drawer zooms to the
      field instead of opening the editor). */
  onCardDoubleClick?: () => void
  /** Called after the in-card confirmation — host performs the delete. */
  onDelete: () => void
  /** Pin/shape toggle — map context only; omit to hide the toggle. */
  onToggleDisplay?: () => void
}

export default function FieldSummaryCard({
  field, focused = false, focusNonce = 0,
  onSelect, onOpenEditor, onCardDoubleClick, onDelete, onToggleDisplay,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Self-contained flows: quick check-off/partial modal + full ops screen
  const [checking, setChecking] = useState<{
    mode: 'complete' | 'partial'
    op: RecommendedOperation
    event: PlantingEvent
  } | null>(null)
  const [showOps, setShowOps] = useState(false)
  // "Registrar hallazgo" — scouting capture for this field
  const [reportingFinding, setReportingFinding] = useState(false)
  const completeOp = useCompleteRecommendedOp(field.farmId)
  const skipOp = useSkipRecommendedOp(field.farmId)
  const partialOp = useLogPartialRecommendedOp(field.farmId)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Defer the single-click action so a double click can cancel it —
  // otherwise the two clicks of a dblclick toggle the selection off
  // before the double-click handler runs (mirrors PlacedField on the map).
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
  }, [])

  function handleCardClick() {
    if (!onSelect) return
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      onSelect()
    }, 250)
  }

  function handleCardDoubleClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    ;(onCardDoubleClick ?? onOpenEditor)()
  }

  const summary = computeCropSummary(field.rows ?? [], field.freePlants ?? [], getCropById)
  const health = getFieldOperationHealth(field.plantingEvents ?? [])

  // Most urgent open calendar item — checkable right from the card
  const next = nextOperation(field)
  const nextCrop = next ? getCropById(next.event.cropTypeId) : null
  const nextIsDue = next?.op.status === 'due'
  const nextDate = next
    ? new Date(next.op.recommendedDate + 'T12:00:00')
        .toLocaleDateString('es-PR', { day: 'numeric', month: 'short' })
    : null

  // Scroll into view when focused (nonce re-triggers on repeat focus)
  useEffect(() => {
    if (focused) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, focusNonce])

  return (
    <div
      ref={cardRef}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      className={`px-4 py-3 hover:bg-[#fafcf8] transition-colors cursor-pointer ${
        focused ? 'bg-[#f5f8f0] border-l-2 border-l-[#639922]' : ''
      }`}
    >

      {/* Field name + color + operation badges */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: field.color }}
          />
          <span className="text-sm font-medium text-[#2d4a1e] truncate">{field.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {health.overdue > 0 && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 rounded-full">
              <AlertCircle size={8} className="text-red-500" />
              <span className="text-[9px] text-red-600 font-bold">{health.overdue}</span>
            </div>
          )}
          {health.dueSoon > 0 && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 rounded-full">
              <Clock size={8} className="text-amber-500" />
              <span className="text-[9px] text-amber-600 font-bold">{health.dueSoon}</span>
            </div>
          )}
        </div>
      </div>

      {/* Area */}
      {field.boundary && field.boundary.length >= 3 && (() => {
        const bbox = farmBoundaryToBBox(field.boundary)
        const scale = getCanvasScale(bbox)
        const pts = field.boundary.map(p => latlngToCanvas(p.lat, p.lng, bbox))
        const acres = ft2ToAcres(areaFt2(pts, scale))
        return (
          <p className="text-[10px] text-[#9aab8a] mb-1.5">
            {acres.toFixed(3)} ac
          </p>
        )
      })()}

      {/* Crop summary */}
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
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

      {/* Current operation — check it off without leaving the card */}
      {next && (
        <div
          onDoubleClick={(e) => { e.stopPropagation(); setShowOps(true) }}
          title="Doble clic para ver todas las operaciones"
          className={`flex items-center gap-2 mb-2.5 px-2 py-1.5 rounded-lg ${
            nextIsDue ? 'bg-red-50/70' : 'bg-[#f5f8f0]'
          }`}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-[#2d4a1e] truncate">
              {nextCrop?.emoji ?? '🌱'} {next.op.labelEs}
            </p>
            <p className={`text-[9px] ${nextIsDue ? 'text-red-500 font-medium' : 'text-[#9aab8a]'}`}>
              {nextIsDue ? 'Vencida — ' : ''}{nextDate}
              {nextCrop ? ` · ${nextCrop.nameEs}` : ''}
            </p>
          </div>
          {/* Same actions as the operations-screen rows */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setChecking({ mode: 'complete', op: next.op, event: next.event })
            }}
            title="Marcar como realizada"
            className="text-[10px] shrink-0 text-[#2d4a1e] font-semibold hover:text-[#639922] transition-colors"
          >
            Completa
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setChecking({ mode: 'partial', op: next.op, event: next.event })
            }}
            title="Registrar avance sin completar la labor"
            className="text-[10px] shrink-0 text-[#639922] hover:text-[#2d4a1e] font-medium transition-colors"
          >
            Parcial
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              skipOp.mutate(
                { fieldId: field.id, eventId: next.event.id, operationId: next.op.id },
                { onSuccess: () => toast.success('Operación omitida') }
              )
            }}
            className="text-[10px] shrink-0 text-[#c0d0b0] hover:text-[#9aab8a] transition-colors"
          >
            Omitir
          </button>
        </div>
      )}

      {/* Pin / shape toggle — map context only */}
      {onToggleDisplay && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleDisplay() }}
          className="flex items-center gap-1.5 mb-2.5 text-[10px] text-[#5a6a4a] hover:text-[#2d4a1e] transition-colors w-full"
        >
          {field.displayMode === 'pin' ? (
            <>
              <MapPin size={10} className="text-[#639922]" />
              <span>Mostrar como pin</span>
              <ToggleLeft size={13} className="text-[#c0d0b0] ml-auto" />
            </>
          ) : (
            <>
              <Layers size={10} className="text-[#639922]" />
              <span>Mostrar como forma</span>
              <ToggleRight size={13} className="text-[#639922] ml-auto" />
            </>
          )}
        </button>
      )}

      {/* Actions */}
      {!confirmDelete ? (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowOps(true) }}
            title="Ver el calendario completo de labores"
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#2d4a1e] border border-[#c8dca8] bg-[#eaf3de] rounded-lg hover:bg-[#d9ecc4] transition-colors"
          >
            <CalendarDays size={10} /> Operaciones
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenEditor() }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
          >
            <Pencil size={10} /> Editar
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#9aab8a] border border-[#e0e8d8] rounded-lg hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={10} /> Eliminar
          </button>
          {/* Scouting: register a pest/disease finding on this field */}
          <button
            onClick={(e) => { e.stopPropagation(); setReportingFinding(true) }}
            title="Registrar hallazgo de plaga o enfermedad"
            className="shrink-0 flex items-center justify-center px-2 py-1.5 text-[#b8860b] border border-[#e8dcc0] rounded-lg hover:bg-amber-50 hover:border-amber-200 transition-colors"
          >
            <Bug size={11} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-red-500 text-center">
            ¿Eliminar "{field.name}"?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="flex-1 py-1.5 text-[10px] text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              Sí, eliminar
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
              className="flex-1 py-1.5 text-[10px] text-[#5a6a4a] border border-[#e0e8d8] rounded-lg hover:bg-[#f5f8f0] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modals render inside this clickable card — fence their clicks off
          so they don't bubble into the card's select/double-click actions
          (which would select fields on the map or open the editor). */}
      <div
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {/* Full operations UI — same screen as everywhere else */}
        {showOps && (
          <FieldOperationsContainer
            farmId={field.farmId}
            fieldId={field.id}
            onClose={() => setShowOps(false)}
          />
        )}

        {/* Scouting capture — pest + severity + where (map taps work) */}
        {reportingFinding && (
          <FindingModal
            farmId={field.farmId}
            fieldId={field.id}
            fieldRows={field.rows ?? []}
            freePlants={field.freePlants ?? []}
            onClose={() => setReportingFinding(false)}
          />
        )}

        {/* Quick check-off / partial modal — flexible selection included */}
        {checking && (
          <CheckOffModal
            mode={checking.mode}
            operation={checking.op}
            harvestTargets={harvestTargetsForOperation(
              checking.op,
              field.plantingEvents ?? [],
              { rows: field.rows ?? [], freePlants: field.freePlants ?? [] }
            )}
            // The card lives over the farm map — rows/plants can be toggled
            // by clicking them right on the imagery.
            mapInteractive
            fieldId={field.id}
            onConfirm={(data) => {
              if (checking.mode === 'partial') {
                partialOp.mutate(
                  {
                    operationId: checking.op.id,
                    data: {
                      date: data.completedDate,
                      product: data.product,
                      quantity: data.quantity,
                      unit: data.unit,
                      notes: data.notes,
                      rowIds: data.rowIds,
                      plantIds: data.plantIds,
                    },
                  },
                  { onSuccess: () => toast.success('Avance parcial registrado') }
                )
              } else {
                completeOp.mutate(
                  {
                    fieldId: field.id,
                    eventId: checking.event.id,
                    operationId: checking.op.id,
                    data,
                  },
                  { onSuccess: () => toast.success('Operación registrada') }
                )
              }
              setChecking(null)
            }}
            onCancel={() => setChecking(null)}
          />
        )}
      </div>
    </div>
  )
}
