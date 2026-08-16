import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Bug, Plus, X, TrendingDown, TrendingUp, MoveRight } from 'lucide-react'
import type { FieldRow, PlantInstance, PlantingEvent } from '@/features/field/types'
import { toast } from '@/store/useToastStore'
import {
  useFindings, useUpdateFinding, useDeleteFinding, useCreateTreatmentOp,
} from '../hooks/useFindingsApi'
import { getPestById } from '../data/pestLibrary'
import { SEVERITY_COLORS, SEVERITY_LABELS, type Finding } from '../types'
import {
  findingScopeSummary, rowsCoveringFinding, eventForFinding,
  canCreateTreatmentLabor,
} from '../utils/findingScope'
import { findingExtentPct, findingTrend } from '../utils/fieldHealth'
import FindingModal from './findingModal'
import { dateLocale, localName } from '@/i18n'

// ──────────────────────────────────────────────────────────────────────────
// Findings list for one field — lives at the top of the operations drawer.
// Lifecycle is manual (open → treated → resolved): creating a labor does
// NOT flip the status, and completing the labor doesn't either — findings
// and operations stay linked only by id reference.
// "Crear labor" makes ONE coarse treatment recommendation: findings are
// precise (down to the plant), treatments are coarse (a sprayer works row
// by row) — the farmer confirms the real scope at check-off.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  farmId: string
  fieldId: string
  fieldRows: FieldRow[]
  freePlants: PlantInstance[]
  plantingEvents: PlantingEvent[]
}

const STATUS_ORDER: Record<string, number> = { open: 0, treated: 1, resolved: 2 }

export default function FindingsSection({
  farmId, fieldId, fieldRows, freePlants, plantingEvents,
}: Props) {
  const { t } = useTranslation('scouting')
  const { data: allFindings } = useFindings(farmId)
  const updateFinding = useUpdateFinding(farmId)
  const deleteFinding = useDeleteFinding(farmId)
  const createTreatment = useCreateTreatmentOp(farmId)
  const [capturing, setCapturing] = useState(false)
  // Re-inspection ("Actualizar") — appends an observation to this finding.
  const [updating, setUpdating] = useState<Finding | null>(null)
  // "Crear labor" asks WHEN the treatment should be due — spraying rarely
  // happens the same day the pest was found.
  const [laborFor, setLaborFor] = useState<Finding | null>(null)
  const [laborDate, setLaborDate] = useState('')

  const findings = useMemo(
    () => (allFindings ?? [])
      .filter(f => f.fieldId === fieldId)
      .sort((a, b) =>
        (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) ||
        b.foundDate.localeCompare(a.foundDate)
      ),
    [allFindings, fieldId]
  )
  const openCount = findings.filter(f => f.status === 'open').length

  function setStatus(f: Finding, status: Finding['status'], message: string) {
    updateFinding.mutate(
      { id: f.id, updates: { status } },
      { onSuccess: () => toast.success(message) }
    )
  }

  // Step 1 — the button opens the date dialog (validating first that a
  // planting event exists to hang the labor on).
  function startCreateTreatment(f: Finding) {
    const pest = getPestById(f.pestId)
    const event = eventForFinding(
      f, { rows: fieldRows, freePlants, plantingEvents }, pest?.crops ?? []
    )
    if (!event) {
      toast.error(t('list.toastNoPlantings'))
      return
    }
    setLaborDate(new Date().toISOString().split('T')[0])
    setLaborFor(f)
  }

  // Step 2 — dialog confirmed: create the labor for the chosen date.
  function handleCreateTreatment(f: Finding, recommendedDate: string) {
    const pest = getPestById(f.pestId)
    const event = eventForFinding(
      f, { rows: fieldRows, freePlants, plantingEvents }, pest?.crops ?? []
    )
    if (!event) {
      toast.error(t('list.toastNoPlantings'))
      return
    }
    const covered = rowsCoveringFinding(f, fieldRows)
    const rowNumbers = covered
      .map(r => fieldRows.findIndex(x => x.id === r.id) + 1)
      .filter(n => n > 0)
      .sort((a, b) => a - b)
    const scopeText = rowNumbers.length > 0
      ? `hileras ${rowNumbers.join(', ')}`
      : 'todo el campo'

    createTreatment.mutate(
      {
        findingId: f.id,
        data: {
          plantingEventId: event.id,
          labelEs: `Tratamiento — ${pest?.nameEs ?? f.pestId}`,
          type: 'spray',
          recommendedDate,
          notes: `Por hallazgo: ${pest?.nameEs ?? f.pestId} (${SEVERITY_LABELS[f.severity]}). Alcance sugerido: ${scopeText}. Confirma el alcance real al completar la labor.`,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('list.toastLaborCreated'))
          setLaborFor(null)
        },
      }
    )
  }

  const smallBtn = 'text-[10px] shrink-0 transition-colors pointer-coarse:text-[11px] pointer-coarse:p-2'

  return (
    <div className="bg-white rounded-xl border border-[#e0e8d8] overflow-hidden shrink-0">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Bug size={16} className="text-[#b8860b] shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#2d4a1e]">{t('list.title')}</p>
          <p className="text-[10px] text-[#9aab8a]">
            {findings.length === 0
              ? t('list.empty')
              : t('list.summary', { count: openCount, total: findings.length })}
          </p>
        </div>
        <button
          onClick={() => setCapturing(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-[#2d4a1e] border border-[#c8dca8] bg-[#eaf3de] rounded-lg hover:bg-[#d9ecc4] transition-colors shrink-0"
        >
          <Plus size={10} /> {t('list.registerButton')}
        </button>
      </div>

      {/* Finding rows */}
      {findings.length > 0 && (
        <div className="divide-y divide-[#f5f8f0] border-t border-[#f5f8f0]">
          {findings.map(f => {
            const pest = getPestById(f.pestId)
            const isClosed = f.status === 'resolved'
            const dateFormatted = new Date(f.foundDate + 'T12:00:00')
              .toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })
            // Derived extent (incidencia) — how much of the field the
            // scope covers; severity stays the scout's judgment.
            const extentPct = findingExtentPct(f, { rows: fieldRows, freePlants })
            const trend = findingTrend(f)
            const history = f.observations ?? []

            return (
              <div
                key={f.id}
                className={`flex items-center gap-3 px-4 py-3 border-l-4 ${
                  isClosed ? 'opacity-50 border-l-gray-300' : 'border-l-transparent'
                }`}
                style={!isClosed
                  ? { borderLeftColor: SEVERITY_COLORS[f.severity] }
                  : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{pest?.emoji ?? '🔍'}</span>
                    <p className={`text-xs font-medium ${
                      isClosed ? 'text-[#9aab8a] line-through' : 'text-[#2d4a1e]'
                    }`}>
                      {localName(pest, f.pestId)}
                    </p>
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white shrink-0"
                      style={{ backgroundColor: SEVERITY_COLORS[f.severity] }}
                    >
                      {t(`severity.${f.severity}`)}
                    </span>
                    {/* Direction of the last re-inspection */}
                    {trend === 'improving' && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-[#639922] shrink-0">
                        <TrendingDown size={9} /> {t('trend.improving')}
                      </span>
                    )}
                    {trend === 'worsening' && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-red-500 shrink-0">
                        <TrendingUp size={9} /> {t('trend.worsening')}
                      </span>
                    )}
                    {trend === 'stable' && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-[#9aab8a] shrink-0">
                        <MoveRight size={9} /> {t('trend.stable')}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#9aab8a] mt-0.5">
                    {dateFormatted} · {findingScopeSummary(f, fieldRows)}
                    {extentPct !== null && extentPct > 0 && ` ${t('list.extentOfField', { pct: extentPct })}`}
                    {f.status !== 'open' && ` · ${t(`status.${f.status}`)}`}
                    {f.treatmentRecommendedOperationId && ` · ${t('laborCreated')}`}
                  </p>
                  {f.notes && (
                    <p className="text-[10px] text-[#7a8a6a] mt-0.5 truncate">{f.notes}</p>
                  )}
                  {/* Re-inspection trail — like partial logs under an
                      operation row; the last entry is the current state */}
                  {history.length > 1 && (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {history.map(obs => (
                        <p key={obs.id} className="text-[10px] text-[#9aab8a]">
                          <span style={{ color: SEVERITY_COLORS[obs.severity] }}>●</span>
                          {' '}
                          {new Date(obs.date + 'T12:00:00')
                            .toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                          {' · '}{t(`severity.${obs.severity}`)}
                          {' · '}{findingScopeSummary(obs, fieldRows)}
                          {(() => {
                            const pct = findingExtentPct(obs, { rows: fieldRows, freePlants })
                            return pct !== null && pct > 0 ? ` ${t('list.extentPct', { pct })}` : ''
                          })()}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions by status */}
                {f.status !== 'resolved' && (
                  <button onClick={() => setUpdating(f)}
                    className={`${smallBtn} text-[#7a8a6a] hover:text-[#2d4a1e]`}
                    title={t('list.updateTitle')}
                  >
                    {t('list.update')}
                  </button>
                )}
                {f.status === 'open' && (
                  <>
                    {canCreateTreatmentLabor(f, plantingEvents) && (
                      <button onClick={() => startCreateTreatment(f)}
                        className={`${smallBtn} text-[#2d4a1e] font-semibold hover:text-[#639922]`}
                        title={t('list.createLaborTitle')}
                      >
                        {t('list.createLabor')}
                      </button>
                    )}
                    <button onClick={() => setStatus(f, 'treated', t('list.toastTreated'))}
                      className={`${smallBtn} text-[#639922] hover:text-[#2d4a1e] font-medium`}
                      title={t('list.treatedTitle')}
                    >
                      {t('list.treated')}
                    </button>
                  </>
                )}
                {f.status === 'treated' && (
                  <>
                    <button onClick={() => setStatus(f, 'resolved', t('list.toastResolved'))}
                      className={`${smallBtn} text-[#639922] hover:text-[#2d4a1e] font-medium`}
                      title={t('list.resolvedTitle')}
                    >
                      {t('list.resolved')}
                    </button>
                    <button onClick={() => setStatus(f, 'open', t('list.toastReopened'))}
                      className={`${smallBtn} text-[#c0d0b0] hover:text-[#9aab8a]`}
                    >
                      {t('list.reopen')}
                    </button>
                  </>
                )}
                {f.status === 'resolved' && (
                  <button onClick={() => setStatus(f, 'open', t('list.toastReopened'))}
                    className={`${smallBtn} text-[#c0d0b0] hover:text-[#639922]`}
                  >
                    {t('list.reopen')}
                  </button>
                )}
                <button
                  onClick={() => deleteFinding.mutate(f.id, {
                    onSuccess: () => toast.success(t('list.toastDeleted')),
                  })}
                  className={`${smallBtn} text-[#c0d0b0] hover:text-red-400`}
                  title={t('list.deleteTitle')}
                >
                  <X size={11} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* "Crear labor" date dialog — spraying rarely happens today */}
      {laborFor && createPortal(
        <>
          <div aria-hidden="true" className="fixed inset-0 bg-black/40 z-[2400] backdrop-blur-sm"
            onClick={() => setLaborFor(null)} />
          <div className="fixed inset-0 z-[2410] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
            <div className="bg-white shadow-xl w-full overflow-hidden pointer-events-auto rounded-t-2xl sm:max-w-sm sm:rounded-2xl">
              <div className="px-6 py-4 border-b border-[#e0e8d8]">
                <h2 className="text-sm font-semibold text-[#2d4a1e]">
                  {t('laborDialog.title', {
                    pest: localName(getPestById(laborFor.pestId), laborFor.pestId),
                  })}
                </h2>
                <p className="text-[10px] text-[#9aab8a] mt-1">{t('laborDialog.hint')}</p>
              </div>
              <div className="px-6 py-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[#5a6a4a]">{t('laborDialog.dateLabel')}</span>
                  <input
                    type="date"
                    value={laborDate}
                    onChange={e => setLaborDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
                  />
                </label>
              </div>
              <div className="px-6 py-4 border-t border-[#e0e8d8] flex justify-end gap-2">
                <button
                  onClick={() => setLaborFor(null)}
                  className="px-4 py-2 text-sm text-[#5a6a4a] hover:bg-[#f0f5e8] rounded-lg transition-colors"
                >
                  {t('actions.cancel', { ns: 'common' })}
                </button>
                <button
                  onClick={() => handleCreateTreatment(laborFor, laborDate)}
                  disabled={!laborDate || createTreatment.isPending}
                  className="px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('laborDialog.confirm')}
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Capture / re-inspection modal — portaled, map taps work */}
      {(capturing || updating) && (
        <FindingModal
          key={updating?.id ?? 'new'}
          farmId={farmId}
          fieldId={fieldId}
          fieldRows={fieldRows}
          freePlants={freePlants}
          updateOf={updating ?? undefined}
          onClose={() => { setCapturing(false); setUpdating(null) }}
        />
      )}
    </div>
  )
}
