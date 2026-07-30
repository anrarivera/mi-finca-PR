import { useMemo, useState } from 'react'
import { Bug, Plus, X, TrendingDown, TrendingUp, MoveRight } from 'lucide-react'
import type { FieldRow, PlantInstance, PlantingEvent } from '@/features/field/types'
import { toast } from '@/store/useToastStore'
import {
  useFindings, useUpdateFinding, useDeleteFinding, useCreateTreatmentOp,
} from '../hooks/useFindingsApi'
import { getPestById } from '../data/pestLibrary'
import {
  SEVERITY_COLORS, SEVERITY_LABELS, FINDING_STATUS_LABELS, type Finding,
} from '../types'
import {
  findingScopeSummary, rowsCoveringFinding, eventForFinding,
  canCreateTreatmentLabor,
} from '../utils/findingScope'
import { findingExtentPct, findingTrend } from '../utils/fieldHealth'
import FindingModal from './findingModal'

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
  const { data: allFindings } = useFindings(farmId)
  const updateFinding = useUpdateFinding(farmId)
  const deleteFinding = useDeleteFinding(farmId)
  const createTreatment = useCreateTreatmentOp(farmId)
  const [capturing, setCapturing] = useState(false)
  // Re-inspection ("Actualizar") — appends an observation to this finding.
  const [updating, setUpdating] = useState<Finding | null>(null)

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

  function handleCreateTreatment(f: Finding) {
    const pest = getPestById(f.pestId)
    const event = eventForFinding(
      f, { rows: fieldRows, freePlants, plantingEvents }, pest?.crops ?? []
    )
    if (!event) {
      toast.error('El campo no tiene siembras — no hay calendario donde crear la labor')
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
          notes: `Por hallazgo: ${pest?.nameEs ?? f.pestId} (${SEVERITY_LABELS[f.severity]}). Alcance sugerido: ${scopeText}. Confirma el alcance real al completar la labor.`,
        },
      },
      { onSuccess: () => toast.success('Labor de tratamiento creada en el calendario') }
    )
  }

  const smallBtn = 'text-[10px] shrink-0 transition-colors'

  return (
    <div className="bg-white rounded-xl border border-[#e0e8d8] overflow-hidden shrink-0">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Bug size={16} className="text-[#b8860b] shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#2d4a1e]">Hallazgos</p>
          <p className="text-[10px] text-[#9aab8a]">
            {findings.length === 0
              ? 'Sin hallazgos registrados'
              : `${openCount} ${openCount === 1 ? 'abierto' : 'abiertos'} · ${findings.length} en total`}
          </p>
        </div>
        <button
          onClick={() => setCapturing(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-[#2d4a1e] border border-[#c8dca8] bg-[#eaf3de] rounded-lg hover:bg-[#d9ecc4] transition-colors shrink-0"
        >
          <Plus size={10} /> Registrar
        </button>
      </div>

      {/* Finding rows */}
      {findings.length > 0 && (
        <div className="divide-y divide-[#f5f8f0] border-t border-[#f5f8f0]">
          {findings.map(f => {
            const pest = getPestById(f.pestId)
            const isClosed = f.status === 'resolved'
            const dateFormatted = new Date(f.foundDate + 'T12:00:00')
              .toLocaleDateString('es-PR', { day: 'numeric', month: 'short' })
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
                      {pest?.nameEs ?? f.pestId}
                    </p>
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white shrink-0"
                      style={{ backgroundColor: SEVERITY_COLORS[f.severity] }}
                    >
                      {SEVERITY_LABELS[f.severity]}
                    </span>
                    {/* Direction of the last re-inspection */}
                    {trend === 'improving' && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-[#639922] shrink-0">
                        <TrendingDown size={9} /> mejorando
                      </span>
                    )}
                    {trend === 'worsening' && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-red-500 shrink-0">
                        <TrendingUp size={9} /> empeorando
                      </span>
                    )}
                    {trend === 'stable' && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium text-[#9aab8a] shrink-0">
                        <MoveRight size={9} /> estable
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#9aab8a] mt-0.5">
                    {dateFormatted} · {findingScopeSummary(f, fieldRows)}
                    {extentPct !== null && extentPct > 0 && ` (≈${extentPct}% del campo)`}
                    {f.status !== 'open' && ` · ${FINDING_STATUS_LABELS[f.status]}`}
                    {f.treatmentRecommendedOperationId && ' · 💧 labor creada'}
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
                            .toLocaleDateString('es-PR', { day: 'numeric', month: 'short' })}
                          {' · '}{SEVERITY_LABELS[obs.severity]}
                          {' · '}{findingScopeSummary(obs, fieldRows)}
                          {(() => {
                            const pct = findingExtentPct(obs, { rows: fieldRows, freePlants })
                            return pct !== null && pct > 0 ? ` (≈${pct}%)` : ''
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
                    title="Registrar un seguimiento — cómo se ve hoy"
                  >
                    Actualizar
                  </button>
                )}
                {f.status === 'open' && (
                  <>
                    {canCreateTreatmentLabor(f, plantingEvents) && (
                      <button onClick={() => handleCreateTreatment(f)}
                        className={`${smallBtn} text-[#2d4a1e] font-semibold hover:text-[#639922]`}
                        title="Crear una labor de tratamiento en el calendario"
                      >
                        Crear labor
                      </button>
                    )}
                    <button onClick={() => setStatus(f, 'treated', 'Hallazgo marcado como tratado')}
                      className={`${smallBtn} text-[#639922] hover:text-[#2d4a1e] font-medium`}
                      title="Ya se aplicó un tratamiento"
                    >
                      Tratado
                    </button>
                  </>
                )}
                {f.status === 'treated' && (
                  <>
                    <button onClick={() => setStatus(f, 'resolved', 'Hallazgo resuelto')}
                      className={`${smallBtn} text-[#639922] hover:text-[#2d4a1e] font-medium`}
                      title="La plaga desapareció"
                    >
                      Resuelto
                    </button>
                    <button onClick={() => setStatus(f, 'open', 'Hallazgo reabierto')}
                      className={`${smallBtn} text-[#c0d0b0] hover:text-[#9aab8a]`}
                    >
                      Reabrir
                    </button>
                  </>
                )}
                {f.status === 'resolved' && (
                  <button onClick={() => setStatus(f, 'open', 'Hallazgo reabierto')}
                    className={`${smallBtn} text-[#c0d0b0] hover:text-[#639922]`}
                  >
                    Reabrir
                  </button>
                )}
                <button
                  onClick={() => deleteFinding.mutate(f.id, {
                    onSuccess: () => toast.success('Hallazgo eliminado'),
                  })}
                  className={`${smallBtn} text-[#c0d0b0] hover:text-red-400`}
                  title="Eliminar este hallazgo"
                >
                  <X size={11} />
                </button>
              </div>
            )
          })}
        </div>
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
