import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { dateLocale, localName, localOpLabel } from '@/i18n'

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
  const { t } = useTranslation('field')
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
      return [field?.name, localName(crop) || null].filter(Boolean).join(' · ')
    }
    if (op.livestockUnit) return op.livestockUnit.name
    return ''
  }

  const smallBtn = 'text-[10px] shrink-0 transition-colors pointer-coarse:text-[11px] pointer-coarse:p-2'

  return (
    <section data-tour="labores-panel" className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <CalendarDays size={16} className="text-[#4d7a1b]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('panel.title')}</h2>
        <span className="text-xs text-[#66755a]">
          {t('panel.subtitle')}{activeFarm ? ` · ${activeFarm.name}` : ''}
        </span>
      </div>

      {/* Health summary — server-authoritative open counts */}
      <div className="grid grid-cols-3 divide-x divide-[#f0f5e8] border-b border-[#f0f5e8]">
        <HealthCell
          icon={<AlertCircle size={13} className="text-red-600" />}
          count={dueSoon?.overdueCount ?? 0} label={t('panel.overdue')}
          className={(dueSoon?.overdueCount ?? 0) > 0 ? 'text-red-600' : 'text-[#66755a]'}
        />
        <HealthCell
          icon={<Clock size={13} className="text-amber-500" />}
          count={dueSoon?.dueSoonCount ?? 0} label={t('panel.next14')}
          className={(dueSoon?.dueSoonCount ?? 0) > 0 ? 'text-amber-600' : 'text-[#66755a]'}
        />
        <HealthCell
          icon={<CheckCircle2 size={13} className="text-[#4d7a1b]" />}
          count={completedCount} label={t('panel.completed')}
          className="text-[#2d4a1e]"
        />
      </div>

      {/* Open work, soonest first — checkable right here */}
      {operations.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#66755a] text-center">
          {t('panel.empty')}
        </p>
      ) : (
        <div className="divide-y divide-[#f0f5e8]">
          {operations.slice(0, LIST_LIMIT).map(op => {
            const overdue = op.recommendedDate < todayISO()
            return (
              <div key={op.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-lg" aria-hidden>{rowEmoji(op)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#2d4a1e] truncate">{localOpLabel(op.labelEs)}</p>
                  <p className={`text-[10px] truncate ${overdue ? 'text-red-600 font-medium' : 'text-[#66755a]'}`}>
                    {overdue ? t('status.overduePrefix') : ''}
                    {new Date(op.recommendedDate + 'T12:00:00')
                      .toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                    {rowContext(op) && ` · ${rowContext(op)}`}
                  </p>
                </div>
                {/* Same three actions as the field cards */}
                <button
                  onClick={() => setChecking({ mode: 'complete', op })}
                  title={t('actions.completeTitle')}
                  className={`${smallBtn} text-[#2d4a1e] font-semibold hover:text-[#4d7a1b]`}
                >
                  {t('actions.complete')}
                </button>
                <button
                  onClick={() => setChecking({ mode: 'partial', op })}
                  title={t('actions.partialTitle')}
                  className={`${smallBtn} text-[#4d7a1b] hover:text-[#2d4a1e] font-medium`}
                >
                  {t('actions.partial')}
                </button>
                <button
                  onClick={() => skipOp.mutate(
                    mutationIds(op),
                    { onSuccess: () => toast.success(t('toast.opSkipped')) }
                  )}
                  className={`${smallBtn} text-[#66755a] hover:text-[#66755a]`}
                >
                  {t('actions.skip')}
                </button>
              </div>
            )
          })}
          {operations.length > LIST_LIMIT && (
            <p className="px-5 py-2 text-[10px] text-[#66755a] text-center">
              {t('panel.moreInNotebook', { count: operations.length - LIST_LIMIT })}
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
          onConfirm={async (data) => {
            // Close only on success — a failed save keeps the modal (and
            // the entered data) open; the API client toasts the reason.
            try {
              if (checking.mode === 'partial') {
                await partialOp.mutateAsync({
                  operationId: checking.op.id,
                  data: {
                    date: data.completedDate,
                    product: data.product,
                    quantity: data.quantity,
                    unit: data.unit,
                    revenue: data.revenue,
                    notes: data.notes,
                    rowIds: data.rowIds,
                    plantIds: data.plantIds,
                  },
                })
                toast.success(t('toast.partialLogged'))
              } else {
                await completeOp.mutateAsync({ ...mutationIds(checking.op), data })
                toast.success(t('toast.opLogged'))
              }
              setChecking(null)
            } catch {
              /* modal stays open */
            }
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
      <span className="text-[10px] text-[#66755a]">{label}</span>
    </div>
  )
}
