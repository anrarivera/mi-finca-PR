import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bug, Download } from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useFindings, useExportFindings } from '../hooks/useFindingsApi'
import { getPestById } from '../data/pestLibrary'
import { SEVERITY_COLORS, SEVERITY_TEXT_COLORS, type Finding } from '../types'
import { findingScopeSummary } from '../utils/findingScope'
import { dateLocale, localName } from '@/i18n'

// ──────────────────────────────────────────────────────────────────────────
// Sanidad — cuaderno de campo section: the RECORDS half of the sanitary
// picture. Pest recurrence over the full history (resolved included —
// that's where "vuelve cada primavera" shows), the complete findings log
// with observation counts, and the certifier CSV (one row per
// observation). The alert half (traffic lights, active findings) lives on
// the Panel de control. Scoped to the active farm.
// ──────────────────────────────────────────────────────────────────────────

export default function SanidadRecordsSection() {
  const { t } = useTranslation('scouting')
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
    new Date(d + 'T12:00:00').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <Bug size={16} className="text-[#b8860b]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('records.title')}</h2>
        <span className="text-xs text-[#66755a]">
          {t('records.findingCount', { count: stats.all.length })}
          {activeFarm ? ` · ${activeFarm.name}` : ''}
        </span>
        {/* Always rendered, disabled when empty — every Cuaderno tab
            keeps its export visible, greyed without data. */}
        <button
          onClick={() => exportCsv.mutate()}
          disabled={stats.all.length === 0 || exportCsv.isPending}
          title={stats.all.length === 0 ? t('records.nothingToExport') : t('records.exportTitle')}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-[#4d7a1b] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={10} /> {t('records.exportCsv')}
        </button>
      </div>

      {stats.all.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#66755a] text-center">
          {t('records.empty')}
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
                  title={t('records.recurrenceTooltip', {
                    findings: t('records.findingCount', { count: r.count }),
                    fields: t('records.fieldCount', { count: r.fieldIds.size }),
                  })}
                >
                  <span aria-hidden>{pest?.emoji ?? '🔍'}</span>
                  <span className="text-xs font-medium text-[#2d4a1e]">
                    {localName(pest, r.pestId)}
                  </span>
                  <span className="text-xs text-[#5a6a4a]">
                    {t('records.timesLast', { times: r.count, date: fmtDate(r.lastDate) })}
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
                        {localName(pest, f.pestId)}
                      </p>
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: SEVERITY_COLORS[f.severity], color: SEVERITY_TEXT_COLORS[f.severity] }}
                      >
                        {t(`severity.${f.severity}`)}
                      </span>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                        resolved
                          ? 'bg-gray-100 text-gray-500'
                          : f.status === 'treated'
                            ? 'bg-[#eaf3de] text-[#3f6414]'
                            : 'bg-red-50 text-red-700'
                      }`}>
                        {t(`status.${f.status}`)}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#66755a] truncate">
                      {fieldName(f.fieldId)}
                      {' · '}{findingScopeSummary(f, rowsFor(f))}
                      {obsCount > 1 && ` · ${t('records.obsCount', { count: obsCount })}`}
                      {f.treatmentRecommendedOperationId && ` · ${t('laborCreated')}`}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold text-[#5a6a4a] shrink-0">
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
