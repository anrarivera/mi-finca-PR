import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Check, SkipForward, ChevronDown, ChevronUp,
  AlertCircle, Clock, CheckCircle2, ChevronRight,
} from 'lucide-react'
import type {
  PlantingEvent, RecommendedOperation, OperationStatus, FieldRow, PlantInstance,
} from '../types'
import type { FarmOperation } from '../hooks/useOperationsApi'
import { getCropById } from '../data/cropLibrary'
import { useHarvestHighlightStore } from '@/store/useHarvestHighlightStore'

// ──────────────────────────────────────────────────────────────────────────
// Operations view — the calendar check-off drawer (SDD §6.2), docked left
// with the map visible beside it, now with:
//  - Undo:   completed/skipped items can be reopened ("Deshacer"/"Reactivar")
//  - Edit:   completed items can be corrected without redoing them
//  - Partial logs: harvests too big for one day are logged day by day
//    ("Parcial") without closing the calendar item; progress accumulates
//    under the row until the final check-off.
// ──────────────────────────────────────────────────────────────────────────

export type CheckOffFormData = {
  completedDate: string
  notes?: string
  product?: string
  quantity?: number
  unit?: string
  /** Fully covered rows (harvest selection). */
  rowIds?: string[]
  /** Individual plants outside those rows (partial rows, loose plants). */
  plantIds?: string[]
}

type ModalMode = 'complete' | 'partial' | 'edit'

// What a harvest can select from: the planting event's rows (kept with their
// position in the field so labels read "Hilera 3") and its free-standing
// plants. Exported so the map/farm drawers reuse the same wiring.
export type HarvestTargets = {
  rows: Array<{ row: FieldRow; index: number }>
  freePlants: PlantInstance[]
}

export function harvestTargetsForOperation(
  operation: RecommendedOperation,
  plantingEvents: PlantingEvent[],
  field: { rows: FieldRow[]; freePlants: PlantInstance[] }
): HarvestTargets {
  const event = plantingEvents.find(e => e.id === operation.plantingEventId)
  if (!event) return { rows: [], freePlants: [] }

  // Primary source: the event's explicit row/plant membership. Fallback for
  // fields saved before the backend linked plants to events (empty arrays):
  // match by the grouping invariant — same crop, same planting date.
  const belongsByGrouping = (cropTypeId: string, plantingDate: string) =>
    cropTypeId === event.cropTypeId && plantingDate === event.plantingDate

  const rows = field.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      event.rowIds.length > 0
        ? event.rowIds.includes(row.id)
        : (row.primaryCropTypeId === event.cropTypeId ||
           row.companionCropTypeId === event.cropTypeId) &&
          row.plantingDate === event.plantingDate
    )
    // Companion rows hold two crops — offer only the event's own plants so
    // "Hilera 2 · Maíz · 0/12" counts just the maíz plants in that row.
    .map(({ row, index }) => ({
      index,
      row: { ...row, plants: row.plants.filter(p => p.cropTypeId === event.cropTypeId) },
    }))
    .filter(({ row }) => row.plants.length > 0)

  const freePlants = field.freePlants.filter(p =>
    event.freePlantIds.length > 0
      ? event.freePlantIds.includes(p.id)
      : belongsByGrouping(p.cropTypeId, p.plantingDate)
  )

  return { rows, freePlants }
}

// Expand a stored selection (rowIds = whole rows, plantIds = loose plants)
// back into the canonical plant-id set the selector edits. Exported for the
// scouting update flow, which preloads a finding's current scope.
export function selectionToPlantSet(
  targets: HarvestTargets,
  rowIds: string[] | undefined,
  plantIds: string[] | undefined
): Set<string> {
  const set = new Set<string>(plantIds ?? [])
  for (const { row } of targets.rows) {
    if (rowIds?.includes(row.id)) row.plants.forEach(p => set.add(p.id))
  }
  return set
}

// Compress a plant-id set into { rowIds, plantIds }: rows where every plant
// is selected become rowIds; everything else stays as individual plantIds.
// Exported for the scouting finding modal, which stores the same shape.
export function plantSetToSelection(
  targets: HarvestTargets,
  selected: Set<string>
): { rowIds?: string[]; plantIds?: string[] } {
  if (selected.size === 0) return {}
  const fullRows = targets.rows.filter(({ row }) =>
    row.plants.length > 0 && row.plants.every(p => selected.has(p.id))
  )
  const coveredByRows = new Set(fullRows.flatMap(({ row }) => row.plants.map(p => p.id)))
  const rowIds = fullRows.map(({ row }) => row.id)
  const plantIds = [...selected].filter(id => !coveredByRows.has(id))
  return {
    rowIds: rowIds.length > 0 ? rowIds : undefined,
    plantIds: plantIds.length > 0 ? plantIds : undefined,
  }
}

type Props = {
  plantingEvents: PlantingEvent[]
  fieldName: string
  /** The field's id — scopes the check-off modal's map toggles. */
  fieldId: string
  /** The field's rows — feeds the harvest selector in the modal. */
  fieldRows: FieldRow[]
  /** The field's free-standing plants — also selectable in harvests. */
  freePlants: PlantInstance[]
  /** Farm operations log — used to show partial-log progress per row. */
  farmOperations: FarmOperation[]
  /** Scouting findings card, rendered above the calendar. Passed as a node
      by the container (not imported) to keep operationsView ↔ scouting
      import-cycle free — the finding modal reuses HarvestSelector. */
  findingsSection?: React.ReactNode
  onClose: () => void
  onCompleteOperation: (eventId: string, operationId: string, data: CheckOffFormData) => void
  onSkipOperation: (eventId: string, operationId: string) => void
  /** Reopen a completed or skipped operation. */
  onUndoOperation: (eventId: string, operationId: string) => void
  /** Correct the values of a completed operation (logId = operations-log entry). */
  onEditOperation: (eventId: string, operationId: string, logId: string, data: CheckOffFormData) => void
  /** Log a day's progress without completing the operation. */
  onPartialLog: (eventId: string, operationId: string, data: CheckOffFormData) => void
}

export default function OperationsView({
  plantingEvents, fieldName, fieldId, fieldRows, freePlants, farmOperations,
  findingsSection, onClose, onCompleteOperation, onSkipOperation,
  onUndoOperation, onEditOperation, onPartialLog,
}: Props) {
  const [modal, setModal] = useState<{
    mode: ModalMode
    eventId: string
    operationId: string
    operation: RecommendedOperation
  } | null>(null)

  // Partial logs grouped by recommended-operation id. A "partial" is any log
  // entry linked to a recommendation that is NOT the entry that completed it
  // (the completing entry is already shown by the row's completed state).
  const partialsByRecOp = useMemo(() => {
    const completedIds = new Set(
      plantingEvents
        .flatMap(e => e.operations)
        .map(op => op.completedOperationId)
        .filter(Boolean) as string[]
    )
    const map = new Map<string, FarmOperation[]>()
    for (const fo of farmOperations) {
      if (!fo.recommendedOperationId || completedIds.has(fo.id)) continue
      const list = map.get(fo.recommendedOperationId) ?? []
      list.push(fo)
      map.set(fo.recommendedOperationId, list)
    }
    return map
  }, [farmOperations, plantingEvents])

  // Sort events by planting date, newest first
  const sortedEvents = [...plantingEvents].sort(
    (a, b) => new Date(b.plantingDate).getTime() - new Date(a.plantingDate).getTime()
  )

  const totalDue = plantingEvents.flatMap(e => e.operations).filter(
    o => o.status === 'due'
  ).length

  const totalPending = plantingEvents.flatMap(e => e.operations).filter(
    o => o.status === 'pending'
  ).length

  // Portaled to <body>: hosts can render this from inside the farm
  // drawer, whose slide transform would otherwise hijack position:fixed.
  // Rendered as a left-docked drawer — the map stays visible beside it so
  // the check-off modal's row/plant map toggles remain usable.
  return createPortal(
    <div
      className="fixed bottom-0 z-[2100] flex flex-col bg-[#f5f8f0] shadow-2xl border-r border-[#e0e8d8]"
      // Docked inside the app frame: right of the 64px side menu and
      // below the 64px top nav — those are never covered.
      style={{ left: 64, top: 64, width: 420, maxWidth: 'calc(100vw - 64px)' }}
    >

      {/* Header */}
      <div className="h-12 bg-[#2d4a1e] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8fba4e] hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
          <span className="text-[#d4e8b0] font-semibold text-sm">
            Operaciones — {fieldName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {totalDue > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 rounded-lg">
              <AlertCircle size={12} className="text-red-300" />
              <span className="text-xs text-red-300 font-medium">
                {totalDue} vencidas
              </span>
            </div>
          )}
          {totalPending > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-lg">
              <Clock size={12} className="text-[#8fba4e]" />
              <span className="text-xs text-[#8fba4e] font-medium">
                {totalPending} pendientes
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 w-full">

        {/* Scouting findings — what the farmer SAW, above what's to DO */}
        {findingsSection}

        {sortedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <CheckCircle2 size={40} className="text-[#c0d8a0]" strokeWidth={1.5} />
            <p className="text-sm text-[#9aab8a] text-center">
              No hay operaciones todavía. Añade cultivos al campo para generar un calendario de operaciones.
            </p>
          </div>
        ) : (
          sortedEvents.map(event => (
            <PlantingEventCard
              key={event.id}
              event={event}
              partialsByRecOp={partialsByRecOp}
              onCheckOff={(operationId, operation) =>
                setModal({ mode: 'complete', eventId: event.id, operationId, operation })
              }
              onSkip={(operationId) => onSkipOperation(event.id, operationId)}
              onUndo={(operationId) => onUndoOperation(event.id, operationId)}
              onEdit={(operationId, operation) =>
                setModal({ mode: 'edit', eventId: event.id, operationId, operation })
              }
              onPartial={(operationId, operation) =>
                setModal({ mode: 'partial', eventId: event.id, operationId, operation })
              }
            />
          ))
        )}
      </div>

      {/* Check-off / partial / edit modal — the map is visible beside
          this drawer, so rows/plants can be toggled right on it */}
      {modal && (
        <CheckOffModal
          mode={modal.mode}
          operation={modal.operation}
          mapInteractive
          fieldId={fieldId}
          harvestTargets={harvestTargetsForOperation(
            modal.operation, plantingEvents, { rows: fieldRows, freePlants }
          )}
          // When editing, preselect what the original log entry covered.
          initialSelection={(() => {
            if (modal.mode !== 'edit' || !modal.operation.completedOperationId) return undefined
            const fo = farmOperations.find(f => f.id === modal.operation.completedOperationId)
            return fo ? { rowIds: fo.rowIds, plantIds: fo.plantIds } : undefined
          })()}
          onConfirm={(data) => {
            if (modal.mode === 'complete') {
              onCompleteOperation(modal.eventId, modal.operationId, data)
            } else if (modal.mode === 'partial') {
              onPartialLog(modal.eventId, modal.operationId, data)
            } else if (modal.operation.completedOperationId) {
              onEditOperation(
                modal.eventId, modal.operationId,
                modal.operation.completedOperationId, data
              )
            }
            setModal(null)
          }}
          onCancel={() => setModal(null)}
        />
      )}
    </div>,
    document.body
  )
}

// ── Planting Event Card ───────────────────────────────────────────────
function PlantingEventCard({
  event, partialsByRecOp, onCheckOff, onSkip, onUndo, onEdit, onPartial,
}: {
  event: PlantingEvent
  partialsByRecOp: Map<string, FarmOperation[]>
  onCheckOff: (operationId: string, operation: RecommendedOperation) => void
  onSkip: (operationId: string) => void
  onUndo: (operationId: string) => void
  onEdit: (operationId: string, operation: RecommendedOperation) => void
  onPartial: (operationId: string, operation: RecommendedOperation) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const crop = getCropById(event.cropTypeId)

  // Each group ordered by due date — a reopened operation slots back into
  // its date position instead of staying where the server left it.
  const byDueDate = (a: RecommendedOperation, b: RecommendedOperation) =>
    a.recommendedDate.localeCompare(b.recommendedDate)
  const due = event.operations.filter(o => o.status === 'due').sort(byDueDate)
  const pending = event.operations.filter(o => o.status === 'pending').sort(byDueDate)
  const completed = event.operations.filter(o => o.status === 'completed').sort(byDueDate)
  const skipped = event.operations.filter(o => o.status === 'skipped').sort(byDueDate)

  const plantingDateFormatted = new Date(event.plantingDate + 'T12:00:00')
    .toLocaleDateString('es-PR', { day: 'numeric', month: 'long', year: 'numeric' })

  const renderRow = (op: RecommendedOperation, status: OperationStatus) => (
    <OperationRow
      key={op.id} operation={op} status={status}
      partials={partialsByRecOp.get(op.id) ?? []}
      onCheckOff={() => onCheckOff(op.id, op)}
      onSkip={() => onSkip(op.id)}
      onUndo={() => onUndo(op.id)}
      onEdit={() => onEdit(op.id, op)}
      onPartial={() => onPartial(op.id, op)}
    />
  )

  return (
    // shrink-0: overflow-hidden would otherwise let the flex column crush
    // the cards to fit instead of letting the list scroll
    <div className="bg-white rounded-xl border border-[#e0e8d8] overflow-hidden shrink-0">

      {/* Event header */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#fafcf8] transition-colors text-left"
      >
        <span className="text-2xl">{crop?.emoji ?? '🌱'}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#2d4a1e]">
            {crop?.nameEs ?? event.cropTypeId}
          </p>
          <p className="text-[10px] text-[#9aab8a]">
            {event.plantCount} plantas · Sembradas el {plantingDateFormatted}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {due.length > 0 && (
            <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
              {due.length} vencidas
            </span>
          )}
          <span className="text-[10px] text-[#9aab8a]">
            {completed.length}/{event.operations.length}
          </span>
          {expanded
            ? <ChevronUp size={14} className="text-[#9aab8a]" />
            : <ChevronDown size={14} className="text-[#9aab8a]" />
          }
        </div>
      </button>

      {/* Progress bar */}
      <div className="h-1 bg-[#f0f5e8]">
        <div
          className="h-full bg-[#639922] transition-all duration-500"
          style={{
            width: `${event.operations.length > 0
              ? (completed.length / event.operations.length) * 100
              : 0}%`
          }}
        />
      </div>

      {/* Operations list: due first, then pending, completed, skipped */}
      {expanded && (
        <div className="divide-y divide-[#f5f8f0]">
          {due.map(op => renderRow(op, 'due'))}
          {pending.map(op => renderRow(op, 'pending'))}
          {completed.map(op => renderRow(op, 'completed'))}
          {skipped.map(op => renderRow(op, 'skipped'))}
        </div>
      )}
    </div>
  )
}

// ── Single operation row ──────────────────────────────────────────────
function OperationRow({
  operation, status, partials, onCheckOff, onSkip, onUndo, onEdit, onPartial,
}: {
  operation: RecommendedOperation
  status: OperationStatus
  partials: FarmOperation[]
  onCheckOff: () => void
  onSkip: () => void
  onUndo: () => void
  onEdit: () => void
  onPartial: () => void
}) {
  const dateFormatted = new Date(operation.recommendedDate + 'T12:00:00')
    .toLocaleDateString('es-PR', { day: 'numeric', month: 'short', year: 'numeric' })

  const operationTypeEmoji: Record<string, string> = {
    fertilization: '🌿',
    spray: '💧',
    cultivation: '⛏️',
    irrigation: '🚿',
    monitoring: '👁️',
    harvest: '🧺',
  }

  const statusStyles: Record<OperationStatus, string> = {
    due: 'border-l-4 border-l-red-400',
    pending: 'border-l-4 border-l-transparent',
    completed: 'border-l-4 border-l-[#639922] opacity-60',
    skipped: 'border-l-4 border-l-gray-300 opacity-50',
  }

  // Partial progress summary, e.g. "2 registros parciales · 150 lb + 3 cajas"
  const partialSummary = (() => {
    if (partials.length === 0) return null
    const totals: Record<string, number> = {}
    for (const p of partials) {
      if (p.quantity && p.quantity > 0) {
        const u = p.unit?.trim() || 'lb'
        totals[u] = (totals[u] ?? 0) + p.quantity
      }
    }
    const qty = Object.entries(totals)
      .map(([u, q]) => `${q.toLocaleString()} ${u}`)
      .join(' + ')
    return `${partials.length} ${partials.length === 1 ? 'registro parcial' : 'registros parciales'}${qty ? ` · ${qty}` : ''}`
  })()

  const isOpen = status === 'pending' || status === 'due'
  const smallBtn = 'text-[10px] shrink-0 transition-colors'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${statusStyles[status]}`}>

      {/* Status indicator — open items complete via the "Completa" button */}
      {status === 'completed' && (
        <div className="w-7 h-7 rounded-full bg-[#eaf3de] flex items-center justify-center shrink-0">
          <Check size={14} className="text-[#639922]" />
        </div>
      )}
      {status === 'skipped' && (
        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <SkipForward size={14} className="text-gray-400" />
        </div>
      )}

      {/* Operation details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{operationTypeEmoji[operation.type] ?? '📋'}</span>
          <p className={`text-xs font-medium ${
            status === 'completed' || status === 'skipped'
              ? 'text-[#9aab8a] line-through'
              : 'text-[#2d4a1e]'
          }`}>
            {operation.labelEs}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className={`text-[10px] ${status === 'due' ? 'text-red-500 font-medium' : 'text-[#9aab8a]'}`}>
            {status === 'due' ? '⚠️ Vencida — ' : ''}
            {status === 'completed' && operation.completedDate
              ? `Completada el ${new Date(operation.completedDate + 'T12:00:00').toLocaleDateString('es-PR', { day: 'numeric', month: 'short' })}`
              : dateFormatted
            }
          </p>
          {operation.product && status === 'completed' && (
            <p className="text-[10px] text-[#9aab8a]">· {operation.product}</p>
          )}
          {operation.quantity != null && status === 'completed' && (
            <p className="text-[10px] text-[#9aab8a]">
              · {operation.quantity.toLocaleString()} {operation.unit ?? ''}
            </p>
          )}
        </div>
        {/* Accumulated partial-log progress (multi-day work) */}
        {partialSummary && (
          <p className="text-[10px] text-[#639922] font-medium mt-0.5">
            {operationTypeEmoji[operation.type] ?? '📋'} {partialSummary}
          </p>
        )}
      </div>

      {/* Row actions by status */}
      {isOpen && (
        <>
          <button onClick={onCheckOff}
            className={`${smallBtn} text-[#2d4a1e] font-semibold hover:text-[#639922]`}
            title="Marcar como realizada"
          >
            Completa
          </button>
          {/* Partial logging works for every type: "fertilized rows 1–3
              today, the rest tomorrow" — the item stays open until done */}
          <button onClick={onPartial}
            className={`${smallBtn} text-[#639922] hover:text-[#2d4a1e] font-medium`}
            title="Registrar avance sin completar la labor"
          >
            Parcial
          </button>
          <button onClick={onSkip}
            className={`${smallBtn} text-[#c0d0b0] hover:text-[#9aab8a]`}
          >
            Omitir
          </button>
        </>
      )}

      {status === 'completed' && (
        <>
          {/* Editing needs the linked log entry; legacy check-offs made
              before the API wiring don't have one */}
          {operation.completedOperationId && (
            <button onClick={onEdit}
              className={`${smallBtn} text-[#7a8a6a] hover:text-[#2d4a1e]`}
              title="Corregir fecha, cantidad o producto"
            >
              Editar
            </button>
          )}
          <button onClick={onUndo}
            className={`${smallBtn} text-[#c0d0b0] hover:text-red-400`}
            title="Deshacer — la labor vuelve a quedar pendiente"
          >
            Deshacer
          </button>
        </>
      )}

      {status === 'skipped' && (
        <button onClick={onUndo}
          className={`${smallBtn} text-[#c0d0b0] hover:text-[#639922]`}
          title="Reactivar esta labor"
        >
          Reactivar
        </button>
      )}

    </div>
  )
}

// ── Check-off / partial / edit modal ──────────────────────────────────
// One form, three modes:
//  - complete: original check-off (empty form, today's date)
//  - partial:  same fields, but confirms a progress log, not a completion
//  - edit:     prefilled with the completed values for correction
// For harvests with rows, a row selector records WHICH rows were harvested
// (multi-day harvests: rows 1–3 today, 4–6 tomorrow). Exported so the map
// view's field drawer can open the same UI.
const MODAL_COPY: Record<ModalMode, { title: string; confirm: string; dateLabel: string }> = {
  complete: { title: 'Confirmar operación', confirm: 'Confirmar', dateLabel: 'Fecha de realización' },
  partial: { title: 'Registrar avance parcial', confirm: 'Registrar avance', dateLabel: 'Fecha del avance' },
  edit: { title: 'Editar operación', confirm: 'Guardar cambios', dateLabel: 'Fecha de realización' },
}

export function CheckOffModal({
  mode, operation, harvestTargets, initialSelection, mapInteractive = false,
  fieldId, onConfirm, onCancel,
}: {
  mode: ModalMode
  operation: RecommendedOperation
  /** What a harvest can select from; empty/omitted = no selector shown. */
  harvestTargets?: HarvestTargets
  /** Previously stored selection (edit mode). */
  initialSelection?: { rowIds?: string[]; plantIds?: string[] }
  /** True when the farm map is visible behind the modal: the backdrop then
      lets clicks through so rows/plants can be toggled right on the map.
      Leave false in fullscreen contexts (clicks would hit the list). */
  mapInteractive?: boolean
  /** The field the operation belongs to — scopes map toggles so only that
      field's rows/plants become clickable while the selector is open. */
  fieldId?: string
  onConfirm: (data: CheckOffFormData) => void
  onCancel: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const isEdit = mode === 'edit'
  const targets = harvestTargets ?? { rows: [], freePlants: [] }

  const [completedDate, setCompletedDate] = useState(
    isEdit ? (operation.completedDate ?? today) : today
  )
  const [notes, setNotes] = useState(isEdit ? (operation.notes ?? '') : '')
  const [product, setProduct] = useState(operation.product ?? '')
  const [quantity, setQuantity] = useState(
    isEdit && operation.quantity != null ? String(operation.quantity) : ''
  )
  const [unit, setUnit] = useState(isEdit ? (operation.unit ?? 'kg') : 'kg')
  // Canonical harvest selection: a set of plant ids. Rows are derived views
  // over it — a fully selected row compresses back to a rowId on confirm.
  const [selectedPlants, setSelectedPlants] = useState<Set<string>>(
    () => selectionToPlantSet(targets, initialSelection?.rowIds, initialSelection?.plantIds)
  )

  const copy = MODAL_COPY[mode]
  const needsProduct = ['fertilization', 'spray'].includes(operation.type)
  const needsQuantity = mode === 'partial'
    || ['fertilization', 'spray', 'harvest'].includes(operation.type)
  // The scope selector (rows / plants / whole field) applies to EVERY
  // operation type — "fertilized rows 1–3", "sprayed just these plants",
  // not only harvests. Hidden when completing: "Completa" means the whole
  // field (empty selection = whole field); a subset goes through "Parcial".
  const showScopeSelector = mode !== 'complete'
    && (targets.rows.length > 0 || targets.freePlants.length > 0)
  // Backdrop goes transparent to clicks only when the map is behind AND
  // there is something to select on it.
  const clickThrough = showScopeSelector && mapInteractive

  const units = operation.type === 'harvest'
    ? ['kg', 'lb', 'unidades', 'cajas', 'sacos']
    : ['kg', 'lb', 'L', 'gal', 'oz']

  // Portaled to <body>: the farm drawer's slide transform would otherwise
  // hijack position:fixed and clamp the modal (and its backdrop) to the
  // 300px drawer panel when opened from a field card.
  return createPortal(
    <>
      {/* Backdrop — kept light and unblurred when a scope selector is
          shown so the map stays visible; over the map it also goes
          transparent to clicks so clicking rows/plants there toggles them
          in the selector (cancel via the button instead) */}
      <div
        className={`fixed inset-0 z-[2200] ${
          clickThrough ? 'bg-black/10 pointer-events-none'
          : showScopeSelector ? 'bg-black/10'
          : 'bg-black/40 backdrop-blur-sm'
        }`}
        onClick={clickThrough ? undefined : onCancel}
      />

      {/* Modal — docked right when selecting scope so the field isn't
          covered; the wrapper never captures clicks, only the card does */}
      <div className={`fixed inset-0 z-[2300] flex items-center p-4 pointer-events-none ${
        showScopeSelector ? 'justify-end pr-6' : 'justify-center'
      }`}>
        {/* Parcial/Editar: fixed 300px card (the farm drawer's width);
            Completa keeps the compact centered card */}
        <div
          className={`bg-white rounded-2xl shadow-xl overflow-hidden max-h-[92vh] overflow-y-auto pointer-events-auto ${
            mode === 'complete' ? 'w-full max-w-sm' : ''
          }`}
          style={mode !== 'complete' ? { width: 300, maxWidth: '100%' } : undefined}
        >

          {/* Header */}
          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0]">
            <p className="text-sm font-semibold text-[#2d4a1e]">
              {copy.title}
            </p>
            <p className="text-xs text-[#7a8a6a] mt-0.5">{operation.labelEs}</p>
            {mode === 'partial' && (
              <p className="text-[10px] text-[#9aab8a] mt-1">
                La labor seguirá pendiente — ideal para trabajos de varios
                días. Márcala completada cuando termines.
              </p>
            )}
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">

            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                {copy.dateLabel}
              </label>
              <input
                type="date"
                value={completedDate}
                max={today}
                onChange={e => setCompletedDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
              />
            </div>

            {/* Product — for fertilization and spray */}
            {needsProduct && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5a6a4a]">
                  Producto utilizado
                  <span className="text-[#9aab8a] font-normal ml-1">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={product}
                  onChange={e => setProduct(e.target.value)}
                  placeholder="Ej. Nitrato de amonio 21-0-0"
                  className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] transition-colors"
                />
              </div>
            )}

            {/* Quantity + unit */}
            {needsQuantity && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5a6a4a]">
                  Cantidad
                  <span className="text-[#9aab8a] font-normal ml-1">(opcional)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    placeholder="0"
                    className="flex-1 px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
                  />
                  <select
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    className="px-2 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors bg-white"
                  >
                    {units.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Scope selector — rows, partial rows, or individual plants */}
            {showScopeSelector && (
              <HarvestSelector
                title={operation.type === 'harvest' ? '¿Qué cosechaste?' : '¿Qué alcanzó esta labor?'}
                targets={targets}
                selected={selectedPlants}
                onChange={setSelectedPlants}
                mapToggles={clickThrough}
                fieldId={fieldId}
              />
            )}

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Notas
                <span className="text-[#9aab8a] font-normal ml-1">(opcional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observaciones, condiciones del campo..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] transition-colors resize-none"
              />
            </div>

          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-[#e0e8d8] flex gap-2">
            <button onClick={onCancel}
              className="flex-1 py-2 text-sm text-[#5a6a4a] hover:bg-[#f0f5e8] rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm({
                completedDate,
                notes: notes || undefined,
                product: product || undefined,
                quantity: quantity ? Number(quantity) : undefined,
                unit: quantity ? unit : undefined,
                // Compress the plant set: full rows → rowIds, rest → plantIds
                ...(showScopeSelector
                  ? plantSetToSelection(targets, selectedPlants)
                  : {}),
              })}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-sm font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Check size={14} />
              {copy.confirm}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}

// ── Harvest selector ──────────────────────────────────────────────────
// Fully flexible: whole rows (tri-state checkbox), individual plants inside
// a row (expand it), "the first N plants of a row" (quick input), and
// free-standing plants. The canonical state is a set of plant ids owned by
// the modal; this component is a controlled view over it. Exported for the
// scouting finding modal, which selects scope the exact same way.
export function HarvestSelector({ title, targets, selected, onChange, mapToggles = false, fieldId }: {
  /** Type-aware heading, e.g. "¿Qué cosechaste?" / "¿Qué alcanzó esta labor?" */
  title: string
  targets: HarvestTargets
  selected: Set<string>
  onChange: (next: Set<string>) => void
  /** Accept clicks from the map (only when the map is actually behind). */
  mapToggles?: boolean
  /** Scopes the map toggles to this field's rows/plants. */
  fieldId?: string
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Publish the live selection so the map highlights the chosen rows and
  // plants while this modal is open (cleared on unmount).
  const setHighlight = useHarvestHighlightStore(s => s.setHighlight)
  const clearHighlight = useHarvestHighlightStore(s => s.clearHighlight)
  const setToggles = useHarvestHighlightStore(s => s.setToggles)
  const clearToggles = useHarvestHighlightStore(s => s.clearToggles)
  useEffect(() => {
    const sel = plantSetToSelection(targets, selected)
    setHighlight({ rowIds: sel.rowIds ?? [], plantIds: [...selected] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, targets])

  // Register map-click toggles: clicking a row line or plant dot on the
  // map toggles it here, exactly like ticking its checkbox. A plant click
  // also expands its row so the checked plant is visible. Re-registered on
  // every selection change to keep the closures fresh.
  useEffect(() => {
    if (!mapToggles) return
    setToggles({
      fieldId,
      toggleRow: (rowId) => {
        const target = targets.rows.find(({ row }) => row.id === rowId)
        if (target) toggleRow(target.row)
      },
      togglePlant: (plantId) => {
        const target = targets.rows.find(({ row }) => row.plants.some(p => p.id === plantId))
        if (target) {
          setExpandedRows(prev => new Set(prev).add(target.row.id))
          requestAnimationFrame(() => {
            rowRefs.current[target.row.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          })
          togglePlant(plantId)
        } else if (targets.freePlants.some(p => p.id === plantId)) {
          togglePlant(plantId)
        }
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, targets, mapToggles])

  useEffect(() => () => { clearHighlight(); clearToggles() }, [clearHighlight, clearToggles])

  const allPlantIds = useMemo(
    () => [
      ...targets.rows.flatMap(({ row }) => row.plants.map(p => p.id)),
      ...targets.freePlants.map(p => p.id),
    ],
    [targets]
  )
  const allSelected = allPlantIds.length > 0 && allPlantIds.every(id => selected.has(id))

  function mutate(fn: (next: Set<string>) => void) {
    const next = new Set(selected)
    fn(next)
    onChange(next)
  }

  function togglePlant(id: string) {
    mutate(next => { next.has(id) ? next.delete(id) : next.add(id) })
  }

  function toggleRow(row: FieldRow) {
    const all = row.plants.every(p => selected.has(p.id))
    mutate(next => {
      row.plants.forEach(p => { all ? next.delete(p.id) : next.add(p.id) })
    })
  }

  // "Primeras N" — select exactly the first N plants of a row.
  function selectFirstN(row: FieldRow, n: number) {
    mutate(next => {
      row.plants.forEach((p, i) => {
        if (i < n) next.add(p.id)
        else next.delete(p.id)
      })
    })
  }

  function toggleExpand(rowId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(rowId) ? next.delete(rowId) : next.add(rowId)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[#5a6a4a]">
          {title}
          <span className="text-[#9aab8a] font-normal ml-1">(opcional)</span>
        </label>
        <button
          type="button"
          onClick={() => onChange(allSelected ? new Set() : new Set(allPlantIds))}
          className="text-[10px] text-[#639922] hover:text-[#2d4a1e] transition-colors"
        >
          {allSelected ? 'Ninguna' : 'Todo el campo'}
        </button>
      </div>

      <div className="max-h-52 overflow-y-auto rounded-lg border border-[#d0dcc0] divide-y divide-[#f0f5e8]">

        {/* Rows — tri-state header, expandable to plants */}
        {targets.rows.map(({ row, index }) => {
          const crop = getCropById(row.primaryCropTypeId)
          const selCount = row.plants.filter(p => selected.has(p.id)).length
          const all = row.plants.length > 0 && selCount === row.plants.length
          const some = selCount > 0 && !all
          const expanded = expandedRows.has(row.id)

          return (
            <div key={row.id} ref={el => { rowRefs.current[row.id] = el }}>
              {/* Row header */}
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-[#fafcf8] transition-colors">
                <input
                  type="checkbox"
                  checked={all}
                  ref={el => { if (el) el.indeterminate = some }}
                  onChange={() => toggleRow(row)}
                  className="accent-[#639922] shrink-0"
                />
                <button
                  type="button"
                  onClick={() => toggleExpand(row.id)}
                  className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                >
                  {expanded
                    ? <ChevronDown size={11} className="text-[#9aab8a] shrink-0" />
                    : <ChevronRight size={11} className="text-[#9aab8a] shrink-0" />}
                  <span className="text-xs text-[#2d4a1e] truncate">
                    Hilera {index + 1} · {crop?.emoji ?? '🌱'} {crop?.nameEs ?? row.primaryCropTypeId}
                  </span>
                  <span className={`text-[10px] shrink-0 ml-auto ${
                    some ? 'text-[#639922] font-medium' : 'text-[#9aab8a]'
                  }`}>
                    {selCount}/{row.plants.length}
                  </span>
                </button>
              </div>

              {/* Expanded: quick "first N" input + individual plants */}
              {expanded && (
                <div className="px-3 pb-2 pl-8 flex flex-col gap-1.5 bg-[#fafcf8]">
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-[#7a8a6a]">Primeras</span>
                    <input
                      type="number"
                      min={0}
                      max={row.plants.length}
                      value={selCount}
                      onChange={e => selectFirstN(
                        row,
                        Math.max(0, Math.min(row.plants.length, parseInt(e.target.value) || 0))
                      )}
                      className="w-14 px-1.5 py-0.5 rounded border border-[#d0dcc0] text-[10px] text-[#2d4a1e] focus:outline-none focus:border-[#639922]"
                    />
                    <span className="text-[10px] text-[#7a8a6a]">
                      de {row.plants.length} plantas
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
                    {row.plants.map((plant, i) => (
                      <label
                        key={plant.id}
                        className="flex items-center gap-1 text-[10px] text-[#5a6a4a] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(plant.id)}
                          onChange={() => togglePlant(plant.id)}
                          className="accent-[#639922]"
                        />
                        Planta {i + 1}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Free-standing plants */}
        {targets.freePlants.length > 0 && (
          <div className="px-3 py-2">
            <p className="text-[10px] font-medium text-[#7a8a6a] mb-1">Plantas sueltas</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {targets.freePlants.map((plant, i) => {
                const crop = getCropById(plant.cropTypeId)
                return (
                  <label
                    key={plant.id}
                    className="flex items-center gap-1 text-[10px] text-[#5a6a4a] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(plant.id)}
                      onChange={() => togglePlant(plant.id)}
                      className="accent-[#639922]"
                    />
                    {crop?.emoji ?? '🌱'} Planta {i + 1}
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-[#9aab8a]">
        {selected.size > 0
          ? `${selected.size} de ${allPlantIds.length} plantas seleccionadas`
          : 'Sin selección = todo el campo. Marca hileras completas, expande una hilera para plantas individuales, o usa "Primeras N".'}
      </p>
    </div>
  )
}
