import { useState } from 'react'
import {
  ClipboardList, AlertCircle, Clock, Download, Loader2,
  Pencil, Trash2, Check,
} from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { useConfirm } from '@/components/shared/confirmDialog'
import { toast } from '@/store/useToastStore'
import {
  useOperations, useDueSoonOperations, useExportOperations,
  useUpdateOperation, useDeleteOperation,
  type FarmOperation,
} from '../hooks/useOperationsApi'

// ──────────────────────────────────────────────────────────────────────────
// Operations log — Dashboard section backed by the server API:
//   GET /farms/:farmId/operations                    → the log entries
//   GET /farms/:farmId/recommended-operations/due-soon → overdue/due badges
//   GET /farms/:farmId/operations/export             → CSV download
// Unlike the "Labores" panel (derived client-side from the loaded fields),
// this shows what was actually LOGGED, straight from the database — the
// SDD §6.2 check-off flow lands its entries here.
// ──────────────────────────────────────────────────────────────────────────

// Spanish labels + emojis for every operation type the API accepts
// (union of SDD §3.2.8 and the crop-schedule types).
const TYPE_META: Record<string, { labelEs: string; emoji: string }> = {
  planting: { labelEs: 'Siembra', emoji: '🌱' },
  fertilization: { labelEs: 'Fertilización', emoji: '🌿' },
  spraying: { labelEs: 'Fumigación', emoji: '💧' },
  spray: { labelEs: 'Fumigación', emoji: '💧' },
  cultivation: { labelEs: 'Cultivo', emoji: '⛏️' },
  irrigation: { labelEs: 'Riego', emoji: '🚿' },
  flowering: { labelEs: 'Floración', emoji: '🌸' },
  monitoring: { labelEs: 'Monitoreo', emoji: '👁️' },
  harvest: { labelEs: 'Cosecha', emoji: '🧺' },
  feeding: { labelEs: 'Alimentación', emoji: '🥕' },
  health_treatment: { labelEs: 'Tratamiento de salud', emoji: '💊' },
  breeding: { labelEs: 'Reproducción', emoji: '🐣' },
  production_record: { labelEs: 'Registro de producción', emoji: '📊' },
  other: { labelEs: 'Otra labor', emoji: '📋' },
}

const MAX_ROWS = 8 // recent entries shown; the CSV export has everything

export default function OperationsLogSection() {
  const activeFarm = useFarmStore(s => s.activeFarm)
  const farmId = activeFarm?.id ?? null

  const { data: operations, isLoading } = useOperations(farmId)
  const { data: dueSoon } = useDueSoonOperations(farmId)
  const exportCsv = useExportOperations(farmId ?? '')

  // Every entry is correctable: edits/deletes propagate server-side to the
  // linked recommendation and harvest yield, so fixing "300 lb" to "30 lb"
  // here fixes it everywhere.
  const updateOp = useUpdateOperation(farmId ?? '')
  const deleteOp = useDeleteOperation(farmId ?? '')
  const { confirm, confirmDialog } = useConfirm()
  const [editing, setEditing] = useState<FarmOperation | null>(null)

  // Resolve fieldId / livestockUnitId to display names from the stores.
  const getField = useFieldStore(s => s.getField)
  const livestockUnits = useLivestockStore(s => s.units)
  const unitName = (id: string | null) =>
    id ? livestockUnits.find(u => u.id === id)?.name ?? null : null

  if (!farmId) return null

  async function handleDelete(op: FarmOperation) {
    const meta = TYPE_META[op.type] ?? TYPE_META.other
    const ok = await confirm({
      title: `¿Eliminar este registro de ${meta.labelEs.toLowerCase()}?`,
      message: op.recommendedOperationId
        ? 'Si este registro completó una labor del calendario, la labor volverá a quedar pendiente. Las cosechas asociadas también se eliminarán.'
        : 'Este registro se eliminará del historial de operaciones.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    deleteOp.mutate(op.id, {
      onSuccess: () => toast.success('Registro eliminado'),
    })
  }

  const recent = (operations ?? []).slice(0, MAX_ROWS)
  const total = operations?.length ?? 0

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">

      {/* Header — count + CSV export */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <ClipboardList size={16} className="text-[#639922]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">Registro de operaciones</h2>
        {total > 0 && (
          <span className="text-xs text-[#9aab8a]">
            {total} {total === 1 ? 'registrada' : 'registradas'}
            {activeFarm ? ` · ${activeFarm.name}` : ''}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => exportCsv.mutate()}
          disabled={total === 0 || exportCsv.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#2d4a1e] border border-[#d0dcc0] rounded-lg hover:bg-[#f0f5e8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={total === 0 ? 'No hay operaciones para exportar' : 'Descargar CSV'}
        >
          {exportCsv.isPending
            ? <Loader2 size={12} className="animate-spin" />
            : <Download size={12} />}
          Exportar CSV
        </button>
      </div>

      {/* Server-verified calendar badges (includes livestock recommendations,
          which the client-side "Labores" numbers don't cover) */}
      {dueSoon && (dueSoon.overdueCount > 0 || dueSoon.dueSoonCount > 0) && (
        <div className="flex gap-2 px-5 py-3 border-b border-[#f0f5e8]">
          {dueSoon.overdueCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 rounded-full">
              <AlertCircle size={12} className="text-red-500" />
              <span className="text-[11px] font-semibold text-red-600">
                {dueSoon.overdueCount} {dueSoon.overdueCount === 1 ? 'vencida' : 'vencidas'}
              </span>
            </div>
          )}
          {dueSoon.dueSoonCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-full">
              <Clock size={12} className="text-amber-500" />
              <span className="text-[11px] font-semibold text-amber-600">
                {dueSoon.dueSoonCount} en los próximos 14 días
              </span>
            </div>
          )}
        </div>
      )}

      {/* Log entries */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-8">
          <Loader2 size={14} className="animate-spin text-[#9aab8a]" />
          <span className="text-xs text-[#9aab8a]">Cargando registro...</span>
        </div>
      ) : recent.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#9aab8a] text-center">
          Aún no has registrado operaciones en esta finca. Marca labores del
          calendario en el editor de campos y aparecerán aquí.
        </p>
      ) : (
        <div className="divide-y divide-[#f0f5e8]">
          {recent.map(op => (
            <OperationLogRow
              key={op.id}
              op={op}
              fieldName={op.fieldId ? getField(op.fieldId)?.name ?? null : null}
              livestockName={unitName(op.livestockUnitId)}
              onEdit={() => setEditing(op)}
              onDelete={() => handleDelete(op)}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <EditOperationModal
          op={editing}
          onCancel={() => setEditing(null)}
          onSave={(updates) => {
            updateOp.mutate(
              { id: editing.id, updates },
              { onSuccess: () => toast.success('Registro actualizado') }
            )
            setEditing(null)
          }}
        />
      )}

      {confirmDialog}
    </section>
  )
}

// ── Single log entry row ──────────────────────────────────────────────
function OperationLogRow({ op, fieldName, livestockName, onEdit, onDelete }: {
  op: FarmOperation
  fieldName: string | null
  livestockName: string | null
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = TYPE_META[op.type] ?? TYPE_META.other

  // Context line: where + what was used, e.g. "Campo Norte · 25 kg · Nitrato…"
  const details = [
    fieldName,
    livestockName,
    op.quantity ? `${op.quantity.toLocaleString()} ${op.unit ?? ''}`.trim() : null,
    op.product,
    op.notes,
  ].filter(Boolean).join(' · ')

  const dateFormatted = new Date(op.actualDate + 'T12:00:00')
    .toLocaleDateString('es-PR', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="group flex items-center gap-3 px-5 py-2.5">
      <span className="text-lg" aria-hidden>{meta.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#2d4a1e] truncate">{meta.labelEs}</p>
        {details && (
          <p className="text-[10px] text-[#9aab8a] truncate">{details}</p>
        )}
      </div>
      <span className="text-[10px] font-semibold text-[#7a8a6a] shrink-0">
        {dateFormatted}
      </span>
      {/* Corrections: edit fixes values in place; delete removes the entry
          (and reopens the calendar item it completed, if any) */}
      <button
        onClick={onEdit}
        aria-label="Editar registro"
        className="w-6 h-6 flex items-center justify-center rounded-lg text-[#c0d0b0] hover:text-[#2d4a1e] hover:bg-[#f0f5e8] transition-colors shrink-0"
      >
        <Pencil size={12} />
      </button>
      <button
        onClick={onDelete}
        aria-label="Eliminar registro"
        className="w-6 h-6 flex items-center justify-center rounded-lg text-[#c0d0b0] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── Edit modal — corrects a log entry's date/quantity/product/notes ───
function EditOperationModal({ op, onSave, onCancel }: {
  op: FarmOperation
  onSave: (updates: {
    actualDate?: string
    product?: string | null
    quantity?: number | null
    unit?: string | null
    notes?: string | null
  }) => void
  onCancel: () => void
}) {
  const meta = TYPE_META[op.type] ?? TYPE_META.other
  const today = new Date().toISOString().split('T')[0]

  const [actualDate, setActualDate] = useState(op.actualDate)
  const [product, setProduct] = useState(op.product ?? '')
  const [quantity, setQuantity] = useState(op.quantity != null ? String(op.quantity) : '')
  const [unit, setUnit] = useState(op.unit ?? 'lb')
  const [notes, setNotes] = useState(op.notes ?? '')

  const units = op.type === 'harvest'
    ? ['kg', 'lb', 'unidades', 'cajas', 'sacos']
    : ['kg', 'lb', 'L', 'gal', 'oz']

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] transition-colors'

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">

          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0]">
            <p className="text-sm font-semibold text-[#2d4a1e]">Editar registro</p>
            <p className="text-xs text-[#7a8a6a] mt-0.5">{meta.emoji} {meta.labelEs}</p>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">Fecha</label>
              <input
                type="date" value={actualDate} max={today}
                onChange={e => setActualDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Cantidad <span className="text-[#9aab8a] font-normal">(opcional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number" min={0} value={quantity} placeholder="0"
                  onChange={e => setQuantity(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <select
                  value={unit} onChange={e => setUnit(e.target.value)}
                  className="px-2 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] bg-white focus:outline-none focus:border-[#639922]"
                >
                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Producto <span className="text-[#9aab8a] font-normal">(opcional)</span>
              </label>
              <input
                type="text" value={product} placeholder="Ej. Nitrato de amonio 21-0-0"
                onChange={e => setProduct(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Notas <span className="text-[#9aab8a] font-normal">(opcional)</span>
              </label>
              <textarea
                value={notes} rows={2} placeholder="Observaciones..."
                onChange={e => setNotes(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-[#e0e8d8] flex gap-2">
            <button onClick={onCancel}
              className="flex-1 py-2 text-sm text-[#5a6a4a] hover:bg-[#f0f5e8] rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onSave({
                actualDate,
                product: product || null,
                quantity: quantity ? Number(quantity) : null,
                unit: quantity ? unit : null,
                notes: notes || null,
              })}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-sm font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Check size={14} />
              Guardar
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
