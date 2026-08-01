import { useMemo, useState } from 'react'
import { AlertCircle, Clock, CheckCircle2, CalendarDays } from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { getCropById } from '../data/cropLibrary'
import { getAnimalById } from '@/features/livestock/data/animalLibrary'
import { getFieldOperationHealth } from '../utils/operationStatus'
import { todayISO, type RecommendedOperation } from '../types'
import { CheckOffModal, harvestTargetsForOperation } from './operationsView'
import {
  useDueSoonOperations, useCompleteRecommendedOp, useSkipRecommendedOp,
  useLogPartialRecommendedOp, type DueSoonOperation,
} from '../hooks/useOperationsApi'
import { toast } from '@/store/useToastStore'

// ──────────────────────────────────────────────────────────────────────────
// Labores — the dashboard's "what's due" panel, server-backed: the
// due-soon feed covers crops AND livestock (client-derived field numbers
// can't see a vaccination). Rows are actionable in place with the same
// Completa / Parcial / Omitir the field cards use; the check-off modal
// runs centered (no map behind it here, so no map taps).
// Scoped to the active farm, like the other server-backed sections.
// ──────────────────────────────────────────────────────────────────────────

const LIST_LIMIT = 8

export default function LaboresPanel() {
  const activeFarm = useFarmStore(s => s.activeFarm)
  const farmId = activeFarm?.id ?? null
  const fields = useFieldStore(s => s.fields)

  const { data: dueSoon } = useDueSoonOperations(farmId)
  const completeOp = useCompleteRecommendedOp(farmId ?? '')
  const skipOp = useSkipRecommendedOp(farmId ?? '')
  const partialOp = useLogPartialRecommendedOp(farmId ?? '')

  const [checking, setChecking] = useState<{
    mode: 'complete' | 'partial'
    op: DueSoonOperation
  } | null>(null)

  // Completed count stays client-derived — the due-soon endpoint only
  // reports open work.
  const completedCount = useMemo(
    () => fields
      .filter(f => f.farmId === farmId)
      .reduce((sum, f) => sum + getFieldOperationHealth(f.plantingEvents ?? []).completed, 0),
    [fields, farmId]
  )

  if (!farmId) return null

  const operations = dueSoon?.operations ?? []
  const fieldFor = (op: DueSoonOperation) =>
    op.plantingEvent ? fields.find(f => f.id === op.plantingEvent!.fieldId) : undefined

  // The check-off/skip mutations patch the local field store optimistically
  // via fieldId+eventId; livestock ops have neither, which the patch helper
  // tolerates (it just finds no field). The server acts on the op id alone.
  function mutationIds(op: DueSoonOperation) {
    return {
      fieldId: op.plantingEvent?.fieldId ?? '',
      eventId: op.plantingEventId ?? '',
      operationId: op.id,
    }
  }

  // CheckOffModal expects the full RecommendedOperation shape — synthesize
  // the fields the due-soon feed doesn't carry.
  function toRecOp(op: DueSoonOperation): RecommendedOperation {
    return {
      id: op.id,
      plantingEventId: op.plantingEventId ?? '',
      templateId: '',
      type: op.type as RecommendedOperation['type'],
      labelEs: op.labelEs,
      recommendedDate: op.recommendedDate,
      status: op.status,
      product: op.product ?? undefined,
      quantity: op.quantity ?? undefined,
      unit: op.unit ?? undefined,
      notes: op.notes ?? undefined,
    }
  }

  function rowEmoji(op: DueSoonOperation): string {
    if (op.plantingEvent) return getCropById(op.plantingEvent.cropTypeId)?.emoji ?? '🌱'
    if (op.livestockUnit) return getAnimalById(op.livestockUnit.animalType)?.emoji ?? '🐾'
    return '📋'
  }

  function rowContext(op: DueSoonOperation): string {
    if (op.plantingEvent) {
      const field = fieldFor(op)
      const crop = getCropById(op.plantingEvent.cropTypeId)
      return [field?.name, crop?.nameEs].filter(Boolean).join(' · ')
    }
    if (op.livestockUnit) return op.livestockUnit.name
    return ''
  }

  const smallBtn = 'text-[10px] shrink-0 transition-colors pointer-coarse:text-[11px] pointer-coarse:p-2'

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <CalendarDays size={16} className="text-[#639922]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">Labores</h2>
        <span className="text-xs text-[#9aab8a]">
          cultivos y animales{activeFarm ? ` · ${activeFarm.name}` : ''}
        </span>
      </div>

      {/* Health summary — server-authoritative open counts */}
      <div className="grid grid-cols-3 divide-x divide-[#f0f5e8] border-b border-[#f0f5e8]">
        <HealthCell
          icon={<AlertCircle size={13} className="text-red-500" />}
          count={dueSoon?.overdueCount ?? 0} label="Vencidas"
          className={(dueSoon?.overdueCount ?? 0) > 0 ? 'text-red-600' : 'text-[#9aab8a]'}
        />
        <HealthCell
          icon={<Clock size={13} className="text-amber-500" />}
          count={dueSoon?.dueSoonCount ?? 0} label="Próx. 14 días"
          className={(dueSoon?.dueSoonCount ?? 0) > 0 ? 'text-amber-600' : 'text-[#9aab8a]'}
        />
        <HealthCell
          icon={<CheckCircle2 size={13} className="text-[#639922]" />}
          count={completedCount} label="Completadas"
          className="text-[#2d4a1e]"
        />
      </div>

      {/* Open work, soonest first — checkable right here */}
      {operations.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#9aab8a] text-center">
          No hay labores vencidas ni próximas. 🎉
        </p>
      ) : (
        <div className="divide-y divide-[#f0f5e8]">
          {operations.slice(0, LIST_LIMIT).map(op => {
            const overdue = op.recommendedDate < todayISO()
            return (
              <div key={op.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-lg" aria-hidden>{rowEmoji(op)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#2d4a1e] truncate">{op.labelEs}</p>
                  <p className={`text-[10px] truncate ${overdue ? 'text-red-500 font-medium' : 'text-[#9aab8a]'}`}>
                    {overdue ? 'Vencida — ' : ''}
                    {new Date(op.recommendedDate + 'T12:00:00')
                      .toLocaleDateString('es-PR', { day: 'numeric', month: 'short' })}
                    {rowContext(op) && ` · ${rowContext(op)}`}
                  </p>
                </div>
                {/* Same three actions as the field cards */}
                <button
                  onClick={() => setChecking({ mode: 'complete', op })}
                  title="Marcar como realizada"
                  className={`${smallBtn} text-[#2d4a1e] font-semibold hover:text-[#639922]`}
                >
                  Completa
                </button>
                <button
                  onClick={() => setChecking({ mode: 'partial', op })}
                  title="Registrar avance sin completar la labor"
                  className={`${smallBtn} text-[#639922] hover:text-[#2d4a1e] font-medium`}
                >
                  Parcial
                </button>
                <button
                  onClick={() => skipOp.mutate(
                    mutationIds(op),
                    { onSuccess: () => toast.success('Operación omitida') }
                  )}
                  className={`${smallBtn} text-[#c0d0b0] hover:text-[#9aab8a]`}
                >
                  Omitir
                </button>
              </div>
            )
          })}
          {operations.length > LIST_LIMIT && (
            <p className="px-5 py-2 text-[10px] text-[#9aab8a] text-center">
              y {operations.length - LIST_LIMIT} más en el cuaderno de campo
            </p>
          )}
        </div>
      )}

      {/* Check-off / partial modal — centered (no map behind it here);
          crop ops still get the checklist scope selector from the store */}
      {checking && (
        <CheckOffModal
          mode={checking.mode}
          operation={toRecOp(checking.op)}
          harvestTargets={(() => {
            const field = fieldFor(checking.op)
            return field
              ? harvestTargetsForOperation(
                  toRecOp(checking.op),
                  field.plantingEvents ?? [],
                  { rows: field.rows ?? [], freePlants: field.freePlants ?? [] }
                )
              : undefined
          })()}
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
                { ...mutationIds(checking.op), data },
                { onSuccess: () => toast.success('Operación registrada') }
              )
            }
            setChecking(null)
          }}
          onCancel={() => setChecking(null)}
        />
      )}
    </section>
  )
}

function HealthCell({ icon, count, label, className }: {
  icon: React.ReactNode
  count: number
  label: string
  className?: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-3">
      <div className="flex items-center gap-1">
        {icon}
        <span className={`text-base font-bold ${className ?? ''}`}>{count}</span>
      </div>
      <span className="text-[10px] text-[#9aab8a]">{label}</span>
    </div>
  )
}
