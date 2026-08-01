import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bug, TrendingDown, TrendingUp, MoveRight } from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useFindings } from '../hooks/useFindingsApi'
import { getPestById } from '../data/pestLibrary'
import { SEVERITY_COLORS, type Finding } from '../types'
import {
  fieldHealth, findingExtentPct, findingTrend,
  FIELD_HEALTH_COLORS,
} from '../utils/fieldHealth'
import { dateLocale, localName } from '@/i18n'

// ──────────────────────────────────────────────────────────────────────────
// Sanidad — dashboard section (Panel de control): the ALERT half of the
// sanitary picture, today-focused:
//   1. ¿Cómo están mis campos?  → traffic-light strip (same fieldHealth
//      logic the map uses, so the numbers always match the map colors)
//   2. ¿Qué tengo activo?       → unresolved findings, worst first
// The RECORDS half (pest recurrence, CSV export, full history) lives in
// the cuaderno de campo (sanidadRecordsSection). Depth and actions live in
// each field's ops drawer. Scoped to the active farm.
// ──────────────────────────────────────────────────────────────────────────

const ACTIVE_LIMIT = 8

export default function SanidadSection() {
  const { t } = useTranslation('scouting')
  const activeFarm = useFarmStore(s => s.activeFarm)
  const farmId = activeFarm?.id ?? null
  const allFields = useFieldStore(s => s.fields)

  const { data: findings } = useFindings(farmId)

  const fields = useMemo(
    () => allFields.filter(f => f.farmId === farmId),
    [allFields, farmId]
  )

  const stats = useMemo(() => {
    const all = findings ?? []

    // Traffic-light strip — one bucket per field, from the shared logic.
    const strip = { sev3: 0, sev2: 0, sev1: 0, healthy: 0, empty: 0 }
    for (const field of fields) {
      const h = fieldHealth(
        { id: field.id, rows: field.rows ?? [], freePlants: field.freePlants ?? [] },
        all
      )
      if (h.status === 'alert') {
        if (h.severity === 3) strip.sev3++
        else if (h.severity === 2) strip.sev2++
        else strip.sev1++
      } else if (h.status === 'healthy') strip.healthy++
      else strip.empty++
    }

    // Active findings — unresolved, worst first, newest as tiebreak.
    const active = all
      .filter(f => f.status !== 'resolved')
      .sort((a, b) =>
        (b.severity - a.severity) || b.foundDate.localeCompare(a.foundDate)
      )

    return { all, strip, active }
  }, [fields, findings])

  if (!farmId) return null

  const fieldName = (id: string) => fields.find(f => f.id === id)?.name ?? ''
  const fieldFor = (f: Finding) => {
    const field = fields.find(x => x.id === f.fieldId)
    return { rows: field?.rows ?? [], freePlants: field?.freePlants ?? [] }
  }

  const fmtDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <Bug size={16} className="text-[#b8860b]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('dashboard.title')}</h2>
        <span className="text-xs text-[#9aab8a]">
          {stats.active.length === 0
            ? t('dashboard.noActive')
            : t('dashboard.activeCount', { count: stats.active.length })}
          {activeFarm ? ` · ${activeFarm.name}` : ''}
        </span>
      </div>

      {/* Traffic-light strip — fields by health, matching the map colors */}
      <div className="grid grid-cols-5 divide-x divide-[#f0f5e8] border-b border-[#f0f5e8]">
        <StripCell color={SEVERITY_COLORS[3]} count={stats.strip.sev3} label={t('severity.3')} />
        <StripCell color={SEVERITY_COLORS[2]} count={stats.strip.sev2} label={t('severity.2')} />
        <StripCell color={SEVERITY_COLORS[1]} count={stats.strip.sev1} label={t('severity.1')} />
        <StripCell color={FIELD_HEALTH_COLORS.healthy} count={stats.strip.healthy} label={t('dashboard.stripHealthy')} />
        <StripCell color={FIELD_HEALTH_COLORS.empty} count={stats.strip.empty} label={t('dashboard.stripEmpty')} />
      </div>

      {stats.all.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#9aab8a] text-center">
          {t('dashboard.emptyAll')}
        </p>
      ) : stats.active.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#9aab8a] text-center">
          {t('dashboard.emptyActive')}
        </p>
      ) : (
        <>
          {/* Active findings — worst first */}
          {stats.active.length > 0 && (
            <div className="divide-y divide-[#f0f5e8]">
              {stats.active.slice(0, ACTIVE_LIMIT).map(f => {
                const pest = getPestById(f.pestId)
                const trend = findingTrend(f)
                const pct = findingExtentPct(f, fieldFor(f))
                return (
                  <div key={f.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-lg" aria-hidden>{pest?.emoji ?? '🔍'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-[#2d4a1e] truncate">
                          {localName(pest, f.pestId)}
                        </p>
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white shrink-0"
                          style={{ backgroundColor: SEVERITY_COLORS[f.severity] }}
                        >
                          {t(`severity.${f.severity}`)}
                        </span>
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
                      <p className="text-[10px] text-[#9aab8a] truncate">
                        {fieldName(f.fieldId)}
                        {pct !== null && pct > 0 && ` · ${t('dashboard.extentOfField', { pct })}`}
                        {f.status === 'treated' && ` · ${t('dashboard.treatedTag')}`}
                        {f.treatmentRecommendedOperationId && ` · ${t('laborCreated')}`}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-[#7a8a6a] shrink-0">
                      {fmtDate(f.foundDate)}
                    </span>
                  </div>
                )
              })}
              {stats.active.length > ACTIVE_LIMIT && (
                <p className="px-5 py-2 text-[10px] text-[#9aab8a] text-center">
                  {t('dashboard.overflow', { count: stats.active.length - ACTIVE_LIMIT })}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function StripCell({ color, count, label }: {
  color: string
  count: number
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-3">
      <div className="flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color, opacity: count > 0 ? 1 : 0.35 }}
          aria-hidden
        />
        <span className={`text-base font-bold ${count > 0 ? 'text-[#2d4a1e]' : 'text-[#c0d0b0]'}`}>
          {count}
        </span>
      </div>
      <span className="text-[10px] text-[#9aab8a]">{label}</span>
    </div>
  )
}
