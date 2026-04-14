import { useState } from 'react'
import { X, Check, SkipForward, ChevronDown, ChevronUp, AlertCircle, Clock, CheckCircle2 } from 'lucide-react'
import type { PlantingEvent, RecommendedOperation, OperationStatus } from '../types'
import { getCropById } from '../data/cropLibrary'

type Props = {
  plantingEvents: PlantingEvent[]
  fieldName: string
  onClose: () => void
  onCompleteOperation: (
    eventId: string,
    operationId: string,
    data: {
      completedDate: string
      notes?: string
      product?: string
      quantity?: number
      unit?: string
    }
  ) => void
  onSkipOperation: (eventId: string, operationId: string) => void
}

export default function OperationsView({
  plantingEvents, fieldName, onClose,
  onCompleteOperation, onSkipOperation,
}: Props) {
  const [checkingOff, setCheckingOff] = useState<{
    eventId: string
    operationId: string
    operation: RecommendedOperation
  } | null>(null)

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
              onCheckOff={(operationId, operation) =>
                setCheckingOff({ eventId: event.id, operationId, operation })
              }
              onSkip={(operationId) => onSkipOperation(event.id, operationId)}
            />
          ))
        )}
      </div>

      {/* Check-off modal */}
      {checkingOff && (
        <CheckOffModal
          operation={checkingOff.operation}
          onConfirm={(data) => {
            onCompleteOperation(
              checkingOff.eventId,
              checkingOff.operationId,
              data
            )
            setCheckingOff(null)
          }}
          onCancel={() => setCheckingOff(null)}
        />
      )}
    </div>
  )
}

// ── Planting Event Card ───────────────────────────────────────────────
function PlantingEventCard({
  event, onCheckOff, onSkip,
}: {
  event: PlantingEvent
  onCheckOff: (operationId: string, operation: RecommendedOperation) => void
  onSkip: (operationId: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const crop = getCropById(event.cropTypeId)

  const due = event.operations.filter(o => o.status === 'due')
  const pending = event.operations.filter(o => o.status === 'pending')
  const completed = event.operations.filter(o => o.status === 'completed')
  const skipped = event.operations.filter(o => o.status === 'skipped')

  const plantingDateFormatted = new Date(event.plantingDate + 'T12:00:00')
    .toLocaleDateString('es-PR', { day: 'numeric', month: 'long', year: 'numeric' })

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

      {/* Operations list */}
      {expanded && (
        <div className="divide-y divide-[#f5f8f0]">

          {/* Due operations first */}
          {due.map(op => (
            <OperationRow
              key={op.id} operation={op} status="due"
              onCheckOff={() => onCheckOff(op.id, op)}
              onSkip={() => onSkip(op.id)}
            />
          ))}

          {/* Pending */}
          {pending.map(op => (
            <OperationRow
              key={op.id} operation={op} status="pending"
              onCheckOff={() => onCheckOff(op.id, op)}
              onSkip={() => onSkip(op.id)}
            />
          ))}

          {/* Completed */}
          {completed.map(op => (
            <OperationRow
              key={op.id} operation={op} status="completed"
              onCheckOff={() => {}}
              onSkip={() => {}}
            />
          ))}

          {/* Skipped */}
          {skipped.map(op => (
            <OperationRow
              key={op.id} operation={op} status="skipped"
              onCheckOff={() => {}}
              onSkip={() => {}}
            />
          ))}

        </div>
      )}
    </div>
  )
}

// ── Single operation row ──────────────────────────────────────────────
function OperationRow({
  operation, status, onCheckOff, onSkip,
}: {
  operation: RecommendedOperation
  status: OperationStatus
  onCheckOff: () => void
  onSkip: () => void
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
        </div>
      </div>

      {/* Skip button — only for pending/due */}
      {(status === 'pending' || status === 'due') && (
        <button
          onClick={onSkip}
          className="text-[10px] text-[#c0d0b0] hover:text-[#9aab8a] transition-colors shrink-0"
        >
          Omitir
        </button>
      )}

    </div>
  )
}

// ── Check-off modal ───────────────────────────────────────────────────
function CheckOffModal({
  operation,
  onConfirm,
  onCancel,
}: {
  operation: RecommendedOperation
  onConfirm: (data: {
    completedDate: string
    notes?: string
    product?: string
    quantity?: number
    unit?: string
  }) => void
  onCancel: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [completedDate, setCompletedDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [product, setProduct] = useState(operation.product ?? '')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('kg')

  const needsProduct = ['fertilization', 'spray'].includes(operation.type)
  const needsQuantity = ['fertilization', 'spray', 'harvest'].includes(operation.type)

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
              Confirmar operación
            </p>
            <p className="text-xs text-[#7a8a6a] mt-0.5">{operation.labelEs}</p>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">

            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Fecha de realización
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
              })}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-sm font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Check size={14} />
              Confirmar
            </button>
          </div>

        </div>
      </div>
    </>
  )
}