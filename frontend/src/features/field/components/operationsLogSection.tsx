import { ClipboardList, AlertCircle, Clock, Download, Loader2 } from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import {
  useOperations, useDueSoonOperations, useExportOperations,
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

  // Resolve fieldId / livestockUnitId to display names from the stores.
  const getField = useFieldStore(s => s.getField)
  const livestockUnits = useLivestockStore(s => s.units)
  const unitName = (id: string | null) =>
    id ? livestockUnits.find(u => u.id === id)?.name ?? null : null

  if (!farmId) return null

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
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Single log entry row ──────────────────────────────────────────────
function OperationLogRow({ op, fieldName, livestockName }: {
  op: FarmOperation
  fieldName: string | null
  livestockName: string | null
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
    <div className="flex items-center gap-3 px-5 py-2.5">
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
    </div>
  )
}
