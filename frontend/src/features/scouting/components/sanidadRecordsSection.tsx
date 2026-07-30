import { useMemo } from 'react'
import { Bug, Download } from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useFindings, useExportFindings } from '../hooks/useFindingsApi'
import { getPestById } from '../data/pestLibrary'
import {
  SEVERITY_COLORS, SEVERITY_LABELS, FINDING_STATUS_LABELS, type Finding,
} from '../types'
import { findingScopeSummary } from '../utils/findingScope'

// ──────────────────────────────────────────────────────────────────────────
// Sanidad — cuaderno de campo section: the RECORDS half of the sanitary
// picture. Pest recurrence over the full history (resolved included —
// that's where "vuelve cada primavera" shows), the complete findings log
// with observation counts, and the certifier CSV (one row per
// observation). The alert half (traffic lights, active findings) lives on
// the Panel de control. Scoped to the active farm.
// ──────────────────────────────────────────────────────────────────────────

export default function SanidadRecordsSection() {
  const activeFarm = useFarmStore(s => s.activeFarm)
  const farmId = activeFarm?.id ?? null
  const allFields = useFieldStore(s => s.fields)

  const { data: findings } = useFindings(farmId)
  const exportCsv = useExportFindings(farmId ?? '')

  const fields = useMemo(
    () => allFields.filter(f => f.farmId === farmId),
    [allFields, farmId]
  )

  const stats = useMemo(() => {
    const all = (findings ?? [])
      .slice()
      .sort((a, b) => b.foundDate.localeCompare(a.foundDate))

    // Recurrence — ALL findings, resolved history included.
    const byPest = new Map<string, { count: number; fieldIds: Set<string>; lastDate: string }>()
    for (const f of all) {
      const entry = byPest.get(f.pestId) ?? { count: 0, fieldIds: new Set(), lastDate: f.foundDate }
      entry.count++
      entry.fieldIds.add(f.fieldId)
      if (f.foundDate > entry.lastDate) entry.lastDate = f.foundDate
      byPest.set(f.pestId, entry)
    }
    const recurrence = [...byPest.entries()]
      .map(([pestId, e]) => ({ pestId, ...e }))
      .sort((a, b) => b.count - a.count)

    return { all, recurrence }
  }, [findings])

  if (!farmId) return null

  const fieldName = (id: string) => fields.find(f => f.id === id)?.name ?? ''
  const rowsFor = (f: Finding) => fields.find(x => x.id === f.fieldId)?.rows ?? []

  const fmtDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-PR', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <Bug size={16} className="text-[#b8860b]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">Registro sanitario</h2>
        <span className="text-xs text-[#9aab8a]">
          {stats.all.length} {stats.all.length === 1 ? 'hallazgo' : 'hallazgos'}
          {activeFarm ? ` · ${activeFarm.name}` : ''}
        </span>
        {stats.all.length > 0 && (
          <button
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending}
            title="Descargar el registro sanitario completo (una fila por observación)"
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors disabled:opacity-50"
          >
            <Download size={10} /> Exportar CSV
          </button>
        )}
      </div>

      {stats.all.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#9aab8a] text-center">
          Sin hallazgos registrados todavía. Usa el botón 🐛 en las tarjetas
          de campo del mapa para anotar plagas o enfermedades.
        </p>
      ) : (
        <>
          {/* Recurrence — which pests keep coming back */}
          <div className="flex flex-wrap gap-2 px-5 py-4 border-b border-[#f0f5e8]">
            {stats.recurrence.map(r => {
              const pest = getPestById(r.pestId)
              return (
                <div key={r.pestId}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f5f8f0] rounded-full"
                  title={`${r.count} ${r.count === 1 ? 'hallazgo' : 'hallazgos'} en ${r.fieldIds.size} ${r.fieldIds.size === 1 ? 'campo' : 'campos'}`}
                >
                  <span aria-hidden>{pest?.emoji ?? '🔍'}</span>
                  <span className="text-xs font-medium text-[#2d4a1e]">
                    {pest?.nameEs ?? r.pestId}
                  </span>
                  <span className="text-xs text-[#7a8a6a]">
                    × {r.count} · últ. {fmtDate(r.lastDate)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Complete history — newest first, resolved included */}
          <div className="divide-y divide-[#f0f5e8]">
            {stats.all.map(f => {
              const pest = getPestById(f.pestId)
              const resolved = f.status === 'resolved'
              const obsCount = f.observations?.length ?? 1
              return (
                <div key={f.id}
                  className={`flex items-center gap-3 px-5 py-2.5 ${resolved ? 'opacity-60' : ''}`}
                >
                  <span className="text-lg" aria-hidden>{pest?.emoji ?? '🔍'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-[#2d4a1e] truncate">
                        {pest?.nameEs ?? f.pestId}
                      </p>
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white shrink-0"
                        style={{ backgroundColor: SEVERITY_COLORS[f.severity] }}
                      >
                        {SEVERITY_LABELS[f.severity]}
                      </span>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                        resolved
                          ? 'bg-gray-100 text-gray-500'
                          : f.status === 'treated'
                            ? 'bg-[#eaf3de] text-[#639922]'
                            : 'bg-red-50 text-red-500'
                      }`}>
                        {FINDING_STATUS_LABELS[f.status]}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#9aab8a] truncate">
                      {fieldName(f.fieldId)}
                      {' · '}{findingScopeSummary(f, rowsFor(f))}
                      {obsCount > 1 && ` · ${obsCount} observaciones`}
                      {f.treatmentRecommendedOperationId && ' · 💧 labor creada'}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold text-[#7a8a6a] shrink-0">
                    {fmtDate(f.foundDate)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
