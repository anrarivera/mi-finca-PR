import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bug, Download } from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import {
  DateRangeSelect, filterSelectClass, SortableTh, type SortDir,
} from '@/components/shared/logFilters'
import { minDateFor, type DateRange } from '@/lib/dateRange'
import { useFindingsLedger, useExportFindings } from '../hooks/useFindingsApi'
import { getPestById } from '../data/pestLibrary'
import { SEVERITY_COLORS, SEVERITY_TEXT_COLORS, type Finding, type FindingStatus } from '../types'
import { findingScopeSummary } from '../utils/findingScope'
import { dateLocale, localName } from '@/i18n'

// ──────────────────────────────────────────────────────────────────────────
// Sanidad — cuaderno de campo section: the RECORDS half of the sanitary
// picture. Pest recurrence over the full history (resolved included —
// that's where "vuelve cada primavera" shows), the complete findings log
// with observation counts, and the certifier CSV (one row per
// observation). The alert half (traffic lights, active findings) lives on
// the Panel de control. Farm-scoped; the selector defaults to the active
// farm. The history renders as a sortable grid on desktop (severity as a
// sort column doubles as spray-priority triage) with the stacked rows
// kept for phones.
// ──────────────────────────────────────────────────────────────────────────

type SortKey = 'pest' | 'severity' | 'status' | 'field' | 'date'

const STATUS_RANK: Record<FindingStatus, number> = { open: 0, treated: 1, resolved: 2 }
const STATUSES: FindingStatus[] = ['open', 'treated', 'resolved']

export default function SanidadRecordsSection() {
  const { t } = useTranslation('scouting')
  const activeFarm = useFarmStore(s => s.activeFarm)
  const farms = useFarmStore(s => s.farms)
  const allFields = useFieldStore(s => s.fields)

  // Farm scope — "Todas las fincas" by default, like the Siembras grid.
  const [farmFilter, setFarmFilter] = useState('all')
  const farmIds = useMemo(
    () => (farmFilter === 'all' ? farms.map(f => f.id) : [farmFilter]),
    [farmFilter, farms]
  )

  const { data: findings } = useFindingsLedger(farmIds)
  // The export endpoint is per farm: the selected farm when one is
  // filtered, the active farm otherwise.
  const exportFarmId = farmFilter !== 'all' ? farmFilter : activeFarm?.id ?? null
  const exportCsv = useExportFindings(exportFarmId ?? '')

  // ── Filters + column sort ────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<'all' | FindingStatus>('all')
  const [pestFilter, setPestFilter] = useState('all')
  const [fieldFilter, setFieldFilter] = useState('all')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function selectFarm(id: string) {
    setFarmFilter(id)
    setStatusFilter('all')
    setPestFilter('all')
    setFieldFilter('all')
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'date' ? 'desc' : 'asc') }
  }

  const scopedFields = useMemo(
    () => (farmFilter === 'all' ? allFields : allFields.filter(f => f.farmId === farmFilter)),
    [allFields, farmFilter]
  )
  // In the all-farms view, same-named fields need their farm to be told
  // apart — append it whenever more than one farm is in scope.
  const fieldName = (id: string) => {
    const field = allFields.find(f => f.id === id)
    if (!field) return ''
    if (farmFilter !== 'all' || farms.length <= 1) return field.name
    const farm = farms.find(f => f.id === field.farmId)
    return farm ? `${field.name} · ${farm.name}` : field.name
  }

  const all = useMemo(
    () => (findings ?? []).slice().sort((a, b) => b.foundDate.localeCompare(a.foundDate)),
    [findings]
  )

  const presentPests = useMemo(
    () => [...new Set(all.map(f => f.pestId))]
      .map(id => ({ id, pest: getPestById(id) }))
      .sort((a, b) => localName(a.pest, a.id).localeCompare(localName(b.pest, b.id))),
    [all]
  )

  const filtered = useMemo(() => {
    const minDate = minDateFor(dateRange)
    return all.filter(f =>
      (statusFilter === 'all' || f.status === statusFilter) &&
      (pestFilter === 'all' || f.pestId === pestFilter) &&
      (fieldFilter === 'all' || f.fieldId === fieldFilter) &&
      (minDate === null || f.foundDate >= minDate)
    )
  }, [all, statusFilter, pestFilter, fieldFilter, dateRange])

  // Recurrence — over the filtered set, so field/date filters narrow the
  // chips along with the list.
  const recurrence = useMemo(() => {
    const byPest = new Map<string, { count: number; fieldIds: Set<string>; lastDate: string }>()
    for (const f of filtered) {
      const entry = byPest.get(f.pestId) ?? { count: 0, fieldIds: new Set(), lastDate: f.foundDate }
      entry.count++
      entry.fieldIds.add(f.fieldId)
      if (f.foundDate > entry.lastDate) entry.lastDate = f.foundDate
      byPest.set(f.pestId, entry)
    }
    return [...byPest.entries()]
      .map(([pestId, e]) => ({ pestId, ...e }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const value = (f: Finding): string | number => {
      switch (sortKey) {
        case 'pest': return localName(getPestById(f.pestId), f.pestId)
        case 'severity': return f.severity
        case 'status': return STATUS_RANK[f.status]
        case 'field': return fieldName(f.fieldId)
        case 'date': return f.foundDate
      }
    }
    return [...filtered].sort((a, b) => {
      const va = value(a), vb = value(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, allFields, farms, farmFilter])

  if (farms.length === 0) return null

  const rowsFor = (f: Finding) => allFields.find(x => x.id === f.fieldId)?.rows ?? []

  const fmtDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })

  const selectedFarm = farms.find(f => f.id === farmFilter)

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <Bug size={16} className="text-[#b8860b]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('records.title')}</h2>
        <span className="text-xs text-[#66755a]">
          {t('records.findingCount', { count: all.length })}
          {selectedFarm ? ` · ${selectedFarm.name}` : ''}
        </span>
        {/* Always rendered, disabled when empty — every Cuaderno tab
            keeps its export visible, greyed without data. */}
        <button
          onClick={() => exportCsv.mutate()}
          disabled={all.length === 0 || !exportFarmId || exportCsv.isPending}
          title={all.length === 0 ? t('records.nothingToExport') : t('records.exportTitle')}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-[#4d7a1b] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={10} /> {t('records.exportCsv')}
        </button>
      </div>

      {/* Filters — farm (when there are several), estado, plaga, campo, dates */}
      {all.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-[#f0f5e8]">
          {farms.length > 1 && (
            <select
              aria-label={t('records.farmFilter')}
              value={farmFilter}
              onChange={e => selectFarm(e.target.value)}
              className={filterSelectClass}
            >
              <option value="all">{t('records.allFarms')}</option>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <select
            aria-label={t('records.allStatuses')}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | FindingStatus)}
            className={filterSelectClass}
          >
            <option value="all">{t('records.allStatuses')}</option>
            {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
          <select
            aria-label={t('records.allPests')}
            value={pestFilter}
            onChange={e => setPestFilter(e.target.value)}
            className={filterSelectClass}
          >
            <option value="all">{t('records.allPests')}</option>
            {presentPests.map(({ id, pest }) => (
              <option key={id} value={id}>
                {pest ? `${pest.emoji} ${localName(pest)}` : id}
              </option>
            ))}
          </select>
          <select
            aria-label={t('records.allFields')}
            value={fieldFilter}
            onChange={e => setFieldFilter(e.target.value)}
            className={filterSelectClass}
          >
            <option value="all">{t('records.allFields')}</option>
            {scopedFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <DateRangeSelect value={dateRange} onChange={setDateRange} />
          <span className="ml-auto text-[11px] text-[#66755a]">
            {t('records.shownCount', { shown: filtered.length, count: all.length })}
          </span>
        </div>
      )}

      {all.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#66755a] text-center">
          {t('records.empty')}
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#66755a] text-center">
          {t('records.noMatch')}
        </p>
      ) : (
        <>
          {/* Recurrence — which pests keep coming back (within the filters) */}
          <div className="flex flex-wrap gap-2 px-5 py-4 border-b border-[#f0f5e8]">
            {recurrence.map(r => {
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

          {/* History as a sortable grid on desktop — severity/estado/fecha
              column sorts are the triage tools (which field to spray first). */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e0e8d8] bg-[#f5f8f0] text-left">
                  <SortableTh label={t('records.columns.pest')} active={sortKey === 'pest'} dir={sortDir} onClick={() => toggleSort('pest')} />
                  <SortableTh label={t('records.columns.severity')} active={sortKey === 'severity'} dir={sortDir} onClick={() => toggleSort('severity')} />
                  <SortableTh label={t('records.columns.status')} active={sortKey === 'status'} dir={sortDir} onClick={() => toggleSort('status')} />
                  <SortableTh label={t('records.columns.field')} active={sortKey === 'field'} dir={sortDir} onClick={() => toggleSort('field')} />
                  <th className="px-3 py-3 font-semibold text-[#5a6a4a]">{t('records.columns.detail')}</th>
                  <SortableTh label={t('records.columns.date')} active={sortKey === 'date'} dir={sortDir} onClick={() => toggleSort('date')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f5e8]">
                {sorted.map(f => {
                  const pest = getPestById(f.pestId)
                  const resolved = f.status === 'resolved'
                  const obsCount = f.observations?.length ?? 1
                  return (
                    <tr key={f.id} className={resolved ? 'opacity-60' : ''}>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5 font-medium text-[#2d4a1e]">
                          <span aria-hidden>{pest?.emoji ?? '🔍'}</span>
                          {localName(pest, f.pestId)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <SeverityBadge severity={f.severity} />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={f.status} />
                      </td>
                      <td className="px-3 py-2.5 text-[#5a6a4a]">{fieldName(f.fieldId)}</td>
                      <td className="px-3 py-2.5 text-[10px] text-[#66755a]">
                        {findingScopeSummary(f, rowsFor(f))}
                        {obsCount > 1 && ` · ${t('records.obsCount', { count: obsCount })}`}
                        {f.treatmentRecommendedOperationId && ` · ${t('laborCreated')}`}
                      </td>
                      <td className="px-3 py-2.5 text-[10px] font-semibold text-[#5a6a4a] whitespace-nowrap">
                        {fmtDate(f.foundDate)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Phone — the stacked rows, following the same sort */}
          <div className="sm:hidden divide-y divide-[#f0f5e8]">
            {sorted.map(f => {
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
                      <SeverityBadge severity={f.severity} />
                      <StatusBadge status={f.status} />
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

function SeverityBadge({ severity }: { severity: number }) {
  const { t } = useTranslation('scouting')
  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
      style={{ backgroundColor: SEVERITY_COLORS[severity], color: SEVERITY_TEXT_COLORS[severity] }}
    >
      {t(`severity.${severity}`)}
    </span>
  )
}

function StatusBadge({ status }: { status: FindingStatus }) {
  const { t } = useTranslation('scouting')
  return (
    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
      status === 'resolved'
        ? 'bg-gray-100 text-gray-500'
        : status === 'treated'
          ? 'bg-[#eaf3de] text-[#3f6414]'
          : 'bg-red-50 text-red-700'
    }`}>
      {t(`status.${status}`)}
    </span>
  )
}
