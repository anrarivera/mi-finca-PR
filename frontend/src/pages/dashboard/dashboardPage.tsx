import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  MapPin, Layers, Sprout, PawPrint, Ruler, Lightbulb,
} from 'lucide-react'
import { fmtNumber } from '@/i18n'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { computeCropSummary } from '@/features/field/utils/rowCalculator'
import { getCropById } from '@/features/field/data/cropLibrary'
import { geodesicAreaAcres } from '@/lib/geo'
import { recommendationService } from '@/features/recommendations/ruleEngine'
import LaboresPanel from '@/features/field/components/laboresPanel'
import SanidadSection from '@/features/scouting/components/sanidadSection'
import type { Recommendation } from '@/features/recommendations/types'

// ──────────────────────────────────────────────────────────────────────────
// Panel de control — the TODAY page: what's happening and what needs doing.
// Stat tiles, due labores (checkable in place, crops + livestock),
// recommendations, and the sanitary alerts. Everything historical or
// tabular (operations log, calendar, harvests, inventory grid, livestock
// management, sanitary records) lives in the cuaderno de campo.
// ──────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation('pages')
  const farms = useFarmStore(s => s.farms)
  const fields = useFieldStore(s => s.fields)
  const livestock = useLivestockStore(s => s.units)

  const stats = useMemo(() => {
    const totalAcres = farms.reduce((sum, farm) => {
      if (farm.boundary && farm.boundary.length >= 3) {
        return sum + geodesicAreaAcres(farm.boundary)
      }
      return sum + (farm.totalAreaAcres || 0)
    }, 0)
    const totalPlants = computeCropSummary(
      fields.flatMap(f => f.rows ?? []),
      fields.flatMap(f => f.freePlants ?? []),
      getCropById
    ).reduce((s, c) => s + c.count, 0)
    const totalAnimals = livestock.reduce((s, u) => s + u.currentCount, 0)

    const recommendations = recommendationService.getRecommendations({
      farms, fields, livestock, today: new Date(),
    })

    return { totalAcres, totalPlants, totalAnimals, recommendations }
  }, [farms, fields, livestock])

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">

      <div>
        <h1 className="text-2xl font-bold text-[#2d4a1e]">{t('dashboard.title')}</h1>
        <p className="text-sm text-[#66755a] mt-1">
          {t('dashboard.subtitle', { count: farms.length })}
        </p>
      </div>

      {farms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e0e8d8] px-6 py-12 text-center">
          <p className="text-4xl mb-3">🌱</p>
          <h2 className="text-base font-semibold text-[#2d4a1e] mb-1">
            {t('dashboard.empty.title')}
          </h2>
          <p className="text-sm text-[#66755a] mb-4">
            {t('dashboard.empty.description')}
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
          >
            {t('dashboard.empty.goToMap')}
          </Link>
        </div>
      ) : (
        <>
          {/* ── Stat tiles ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatTile icon={<MapPin size={16} />} label={t('dashboard.tiles.farms', { count: farms.length })} value={String(farms.length)} />
            <StatTile icon={<Layers size={16} />} label={t('dashboard.tiles.fields', { count: fields.length })} value={String(fields.length)} />
            <StatTile icon={<Ruler size={16} />} label={t('dashboard.tiles.totalArea')} value={fmtNumber(stats.totalAcres, stats.totalAcres >= 100 ? 0 : 2)} suffix="ac" />
            <StatTile icon={<Sprout size={16} />} label={t('dashboard.tiles.plants')} value={fmtNumber(stats.totalPlants)} />
            <StatTile icon={<PawPrint size={16} />} label={t('dashboard.tiles.animals')} value={fmtNumber(stats.totalAnimals)} />
          </div>

          {/* ── Labores due (checkable) + recommendations ──────────── */}
          <div className="grid lg:grid-cols-2 gap-6 items-start">

            {/* Server-backed: crops AND livestock, actionable in place */}
            <LaboresPanel />

            {/* Recommendations panel */}
            <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
                <Lightbulb size={16} className="text-[#4d7a1b]" />
                <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('dashboard.recommendations.title')}</h2>
              </div>
              {stats.recommendations.length === 0 ? (
                <p className="px-5 py-6 text-xs text-[#66755a] text-center">
                  {t('dashboard.recommendations.empty')}
                </p>
              ) : (
                <div className="divide-y divide-[#f0f5e8]">
                  {stats.recommendations.slice(0, 8).map(rec => (
                    <RecommendationRow key={rec.id} rec={rec} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ── Sanidad alerts — field traffic lights + active findings ── */}
          <SanidadSection />
        </>
      )}
    </div>
  )
}

// ── Small presentational pieces ───────────────────────────────────────
function StatTile({ icon, label, value, suffix }: {
  icon: React.ReactNode
  label: string
  value: string
  suffix?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#e0e8d8] px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[#4d7a1b] mb-1.5">
        {icon}
        <span className="text-[10px] font-semibold text-[#5a6a4a] uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-[#2d4a1e]">
        {value}
        {suffix && <span className="text-xs font-medium text-[#66755a] ml-1">{suffix}</span>}
      </p>
    </div>
  )
}

// labelKey resolves in the 'pages' namespace (dashboard.severity.*).
const SEVERITY_STYLES: Record<Recommendation['severity'], { dot: string; labelKey: string }> = {
  urgent: { dot: 'bg-red-500', labelKey: 'dashboard.severity.urgent' },
  warning: { dot: 'bg-amber-400', labelKey: 'dashboard.severity.warning' },
  info: { dot: 'bg-[#639922]', labelKey: 'dashboard.severity.info' },
  tip: { dot: 'bg-[#b0c890]', labelKey: 'dashboard.severity.tip' },
}

function RecommendationRow({ rec }: { rec: Recommendation }) {
  const style = SEVERITY_STYLES[rec.severity]
  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} aria-hidden />
        <p className="text-xs font-semibold text-[#2d4a1e]">{rec.titleEs}</p>
      </div>
      <p className="text-[11px] text-[#5a6a4a] pl-3.5">{rec.detailEs}</p>
    </div>
  )
}
