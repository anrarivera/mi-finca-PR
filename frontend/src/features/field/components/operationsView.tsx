import { useMemo, useState } from 'react'
import {
  X, Check, SkipForward, ChevronDown, ChevronUp,
  AlertCircle, Clock, CheckCircle2,
} from 'lucide-react'
import type { PlantingEvent, RecommendedOperation, OperationStatus, FieldRow } from '../types'
import type { FarmOperation } from '../hooks/useOperationsApi'
import { getCropById } from '../data/cropLibrary'

// ──────────────────────────────────────────────────────────────────────────
// Operations view — the calendar check-off screen (SDD §6.2), now with:
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
  /** Which field rows were covered (harvest row selection). */
  rowIds?: string[]
}

type ModalMode = 'complete' | 'partial' | 'edit'

/** A selectable row in the harvest modal. */
export type RowOption = { id: string; label: string }

// Build the selectable row list for a recommendation: the rows that belong
// to its planting event, labeled by their position in the field ("Hilera 3"),
// crop, and plant count. Exported so the map-side drawer can reuse it.
export function rowOptionsForOperation(
  operation: RecommendedOperation,
  plantingEvents: PlantingEvent[],
  fieldRows: FieldRow[]
): RowOption[] {
  const event = plantingEvents.find(e => e.id === operation.plantingEventId)
  if (!event) return []
  return fieldRows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => event.rowIds.includes(row.id))
    .map(({ row, i }) => ({
      id: row.id,
      label: `Hilera ${i + 1} · ${getCropById(row.primaryCropTypeId)?.nameEs ?? row.primaryCropTypeId} · ${row.plants.length} plantas`,
    }))
}

type Props = {
  plantingEvents: PlantingEvent[]
  fieldName: string
  /** The field's rows — feeds the harvest row selector in the modal. */
  fieldRows: FieldRow[]
  /** Farm operations log — used to show partial-log progress per row. */
  farmOperations: FarmOperation[]
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
  plantingEvents, fieldName, fieldRows, farmOperations, onClose,
  onCompleteOperation, onSkipOperation,
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

  return (
    <div className="fixed inset-0 z-[2100] flex flex-col bg-[#f5f8f0]">

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
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-2xl mx-auto w-full">

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

      {/* Check-off / partial / edit modal */}
      {modal && (
        <CheckOffModal
          mode={modal.mode}
          operation={modal.operation}
          rowOptions={rowOptionsForOperation(modal.operation, plantingEvents, fieldRows)}
          // When editing, preselect the rows the original log entry covered.
          initialRowIds={
            modal.mode === 'edit' && modal.operation.completedOperationId
              ? farmOperations.find(fo => fo.id === modal.operation.completedOperationId)?.rowIds
              : undefined
          }
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
    </div>
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

  const due = event.operations.filter(o => o.status === 'due')
  const pending = event.operations.filter(o => o.status === 'pending')
  const completed = event.operations.filter(o => o.status === 'completed')
  const skipped = event.operations.filter(o => o.status === 'skipped')

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
    <div className="bg-white rounded-xl border border-[#e0e8d8] overflow-hidden">

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

      {/* Status indicator / check button */}
      {status === 'completed' ? (
        <div className="w-7 h-7 rounded-full bg-[#eaf3de] flex items-center justify-center shrink-0">
          <Check size={14} className="text-[#639922]" />
        </div>
      ) : status === 'skipped' ? (
        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <SkipForward size={14} className="text-gray-400" />
        </div>
      ) : (
        <button
          onClick={onCheckOff}
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors hover:bg-[#eaf3de] ${
            status === 'due'
              ? 'border-red-400 hover:border-[#639922]'
              : 'border-[#c0d8a0] hover:border-[#639922]'
          }`}
        />
      )}

      {/* Operation details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{operationTypeEmoji[operation.type] ?? '📋'}</span>
          <p className={`text-xs font-medium truncate ${
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
        {/* Accumulated partial-log progress (multi-day harvests) */}
        {partialSummary && (
          <p className="text-[10px] text-[#639922] font-medium mt-0.5">
            🧺 {partialSummary}
          </p>
        )}
      </div>

      {/* Row actions by status */}
      {isOpen && (
        <>
          {/* Partial logging only makes sense for harvests — spraying half a
              field one day and half the next is logged as two standalone ops */}
          {operation.type === 'harvest' && (
            <button onClick={onPartial}
              className={`${smallBtn} text-[#639922] hover:text-[#2d4a1e] font-medium`}
              title="Registrar avance sin completar la labor"
            >
              Parcial
            </button>
          )}
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
  mode, operation, rowOptions = [], initialRowIds, onConfirm, onCancel,
}: {
  mode: ModalMode
  operation: RecommendedOperation
  /** Selectable rows for harvest operations; empty = no selector shown. */
  rowOptions?: RowOption[]
  /** Preselected rows (edit mode). */
  initialRowIds?: string[]
  onConfirm: (data: CheckOffFormData) => void
  onCancel: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const isEdit = mode === 'edit'

  const [completedDate, setCompletedDate] = useState(
    isEdit ? (operation.completedDate ?? today) : today
  )
  const [notes, setNotes] = useState(isEdit ? (operation.notes ?? '') : '')
  const [product, setProduct] = useState(operation.product ?? '')
  const [quantity, setQuantity] = useState(
    isEdit && operation.quantity != null ? String(operation.quantity) : ''
  )
  const [unit, setUnit] = useState(isEdit ? (operation.unit ?? 'kg') : 'kg')
  const [selectedRows, setSelectedRows] = useState<Set<string>>(
    () => new Set(initialRowIds ?? [])
  )

  const copy = MODAL_COPY[mode]
  const needsProduct = ['fertilization', 'spray'].includes(operation.type)
  const needsQuantity = mode === 'partial'
    || ['fertilization', 'spray', 'harvest'].includes(operation.type)
  const showRows = operation.type === 'harvest' && rowOptions.length > 0

  function toggleRow(id: string) {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const units = operation.type === 'harvest'
    ? ['kg', 'lb', 'unidades', 'cajas', 'sacos']
    : ['kg', 'lb', 'L', 'gal', 'oz']

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[2200] backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[2300] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">

          {/* Header */}
          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0]">
            <p className="text-sm font-semibold text-[#2d4a1e]">
              {copy.title}
            </p>
            <p className="text-xs text-[#7a8a6a] mt-0.5">{operation.labelEs}</p>
            {mode === 'partial' && (
              <p className="text-[10px] text-[#9aab8a] mt-1">
                La labor seguirá pendiente — ideal para cosechas de varios días.
                Márcala completada cuando termines.
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

            {/* Row selector — which rows did this harvest cover? */}
            {showRows && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[#5a6a4a]">
                    Hileras cosechadas
                    <span className="text-[#9aab8a] font-normal ml-1">(opcional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSelectedRows(prev =>
                      prev.size === rowOptions.length
                        ? new Set()
                        : new Set(rowOptions.map(r => r.id))
                    )}
                    className="text-[10px] text-[#639922] hover:text-[#2d4a1e] transition-colors"
                  >
                    {selectedRows.size === rowOptions.length ? 'Ninguna' : 'Todas'}
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-[#d0dcc0] divide-y divide-[#f0f5e8]">
                  {rowOptions.map(row => (
                    <label
                      key={row.id}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs text-[#2d4a1e] cursor-pointer hover:bg-[#fafcf8] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        className="accent-[#639922]"
                      />
                      <span className="truncate">{row.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-[#9aab8a]">
                  Sin selección = todo el campo. Útil para cosechas de varios
                  días: marca hoy las hileras que terminaste.
                </p>
              </div>
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
                rowIds: showRows && selectedRows.size > 0
                  ? [...selectedRows]
                  : undefined,
              })}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-sm font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Check size={14} />
              {copy.confirm}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
