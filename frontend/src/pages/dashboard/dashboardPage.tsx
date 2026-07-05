import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  MapPin, Layers, Sprout, PawPrint, Ruler,
  AlertCircle, Clock, CheckCircle2, CalendarDays, Lightbulb,
} from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { computeCropSummary } from '@/features/field/utils/rowCalculator'
import { getFieldOperationHealth } from '@/features/field/utils/operationStatus'
import { todayISO } from '@/features/field/types'
import { getCropById } from '@/features/field/data/cropLibrary'
import { geodesicAreaAcres } from '@/lib/geo'
import { recommendationService } from '@/features/recommendations/ruleEngine'
import { collectHarvestEntries, totalHarvestsByCrop } from '@/features/field/utils/harvestLog'
import LivestockSection from '@/features/livestock/components/livestockSection'
import OperationsCalendar from '@/features/field/components/operationsCalendar'
import type { Recommendation } from '@/features/recommendations/types'

// ──────────────────────────────────────────────────────────────────────────
// Dashboard — operational overview across all farms: stat tiles, operations
// health, upcoming work, crop inventory, recommendations, and livestock.
// ──────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
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
    const cropSummary = computeCropSummary(
      fields.flatMap(f => f.rows ?? []),
      fields.flatMap(f => f.freePlants ?? []),
      getCropById
    ).sort((a, b) => b.count - a.count)
    const totalPlants = cropSummary.reduce((s, c) => s + c.count, 0)
    const totalAnimals = livestock.reduce((s, u) => s + u.currentCount, 0)

    const health = fields.reduce(
      (acc, f) => {
        const h = getFieldOperationHealth(f.plantingEvents ?? [])
        acc.overdue += h.overdue
        acc.dueSoon += h.dueSoon
        acc.upcoming += h.upcoming
        acc.completed += h.completed
        return acc
      },
      { overdue: 0, dueSoon: 0, upcoming: 0, completed: 0 }
    )

    // Next pending operations across every field, soonest first
    const nextOps = fields
      .flatMap(field =>
        (field.plantingEvents ?? []).flatMap(event =>
          event.operations
            .filter(op => op.status !== 'completed' && op.status !== 'skipped')
            .map(op => ({
              op,
              fieldName: field.name,
              crop: getCropById(event.cropTypeId),
            }))
        )
      )
      .sort((a, b) => a.op.recommendedDate.localeCompare(b.op.recommendedDate))
      .slice(0, 6)

    const recommendations = recommendationService.getRecommendations({
      farms, fields, livestock, today: new Date(),
    })

    const harvestEntries = collectHarvestEntries(fields)
    const harvestTotals = totalHarvestsByCrop(harvestEntries)

    return {
      totalAcres, cropSummary, totalPlants, totalAnimals, health, nextOps,
      recommendations, harvestEntries, harvestTotals,
    }
  }, [farms, fields, livestock])

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">

      <div>
        <h1 className="text-2xl font-bold text-[#2d4a1e]">Panel de control</h1>
        <p className="text-sm text-[#9aab8a] mt-1">
          Resumen de {farms.length === 1 ? 'tu finca' : 'tus fincas'} y labores pendientes
        </p>
      </div>

      {farms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e0e8d8] px-6 py-12 text-center">
          <p className="text-4xl mb-3">🌱</p>
          <h2 className="text-base font-semibold text-[#2d4a1e] mb-1">
            Todavía no tienes fincas
          </h2>
          <p className="text-sm text-[#9aab8a] mb-4">
            Crea tu primera finca en el mapa para ver estadísticas aquí.
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
          >
            Ir al mapa
          </Link>
        </div>
      ) : (
        <>
          {/* ── Stat tiles ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatTile icon={<MapPin size={16} />} label={farms.length === 1 ? 'Finca' : 'Fincas'} value={String(farms.length)} />
            <StatTile icon={<Layers size={16} />} label={fields.length === 1 ? 'Campo' : 'Campos'} value={String(fields.length)} />
            <StatTile icon={<Ruler size={16} />} label="Área total" value={stats.totalAcres >= 100 ? Math.round(stats.totalAcres).toLocaleString() : stats.totalAcres.toFixed(2)} suffix="ac" />
            <StatTile icon={<Sprout size={16} />} label="Plantas" value={stats.totalPlants.toLocaleString()} />
            <StatTile icon={<PawPrint size={16} />} label="Animales" value={stats.totalAnimals.toLocaleString()} />
          </div>

          {/* ── Operations + recommendations ───────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-6 items-start">

            {/* Operations panel */}
            <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
                <CalendarDays size={16} className="text-[#639922]" />
                <h2 className="text-sm font-semibold text-[#2d4a1e]">Labores</h2>
              </div>

              {/* Health summary */}
              <div className="grid grid-cols-3 divide-x divide-[#f0f5e8] border-b border-[#f0f5e8]">
                <HealthCell
                  icon={<AlertCircle size={13} className="text-red-500" />}
                  count={stats.health.overdue} label="Vencidas"
                  className={stats.health.overdue > 0 ? 'text-red-600' : 'text-[#9aab8a]'}
                />
                <HealthCell
                  icon={<Clock size={13} className="text-amber-500" />}
                  count={stats.health.dueSoon} label="Próx. 14 días"
                  className={stats.health.dueSoon > 0 ? 'text-amber-600' : 'text-[#9aab8a]'}
                />
                <HealthCell
                  icon={<CheckCircle2 size={13} className="text-[#639922]" />}
                  count={stats.health.completed} label="Completadas"
                  className="text-[#2d4a1e]"
                />
              </div>

              {/* Upcoming list */}
              {stats.nextOps.length === 0 ? (
                <p className="px-5 py-6 text-xs text-[#9aab8a] text-center">
                  No hay labores pendientes. Añade hileras de cultivo a tus campos
                  para generar el calendario agronómico.
                </p>
              ) : (
                <div className="divide-y divide-[#f0f5e8]">
                  {stats.nextOps.map(({ op, fieldName, crop }) => {
                    const overdue = op.recommendedDate < todayISO()
                    return (
                      <div key={op.id} className="flex items-center gap-3 px-5 py-2.5">
                        <span className="text-lg" aria-hidden>{crop?.emoji ?? '🌱'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#2d4a1e] truncate">{op.labelEs}</p>
                          <p className="text-[10px] text-[#9aab8a] truncate">
                            {fieldName}{crop ? ` · ${crop.nameEs}` : ''}
                          </p>
                        </div>
                        <span className={`text-[10px] font-semibold shrink-0 ${overdue ? 'text-red-500' : 'text-[#7a8a6a]'}`}>
                          {op.recommendedDate}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Recommendations panel */}
            <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
                <Lightbulb size={16} className="text-[#639922]" />
                <h2 className="text-sm font-semibold text-[#2d4a1e]">Recomendaciones</h2>
              </div>
              {stats.recommendations.length === 0 ? (
                <p className="px-5 py-6 text-xs text-[#9aab8a] text-center">
                  Todo al día — no hay recomendaciones por ahora. 🎉
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

          {/* ── Operations month calendar ──────────────────────────── */}
          {fields.length > 0 && <OperationsCalendar fields={fields} />}

          {/* ── Harvest log ────────────────────────────────────────── */}
          {stats.harvestEntries.length > 0 && (
            <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
                <span className="text-base" aria-hidden>🧺</span>
                <h2 className="text-sm font-semibold text-[#2d4a1e]">Cosechas registradas</h2>
                <span className="text-xs text-[#9aab8a]">
                  {stats.harvestEntries.length} en total
                </span>
              </div>

              {/* Totals per crop */}
              <div className="flex flex-wrap gap-2 px-5 py-4 border-b border-[#f0f5e8]">
                {stats.harvestTotals.map(t => {
                  const crop = getCropById(t.cropTypeId)
                  const quantities = Object.entries(t.totalsByUnit)
                    .map(([unit, qty]) => `${qty.toLocaleString()} ${unit}`)
                    .join(' + ')
                  return (
                    <div key={t.cropTypeId}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f5f8f0] rounded-full"
                    >
                      <span aria-hidden>{crop?.emoji ?? '🌱'}</span>
                      <span className="text-xs font-medium text-[#2d4a1e]">
                        {crop?.nameEs ?? t.cropTypeId}
                      </span>
                      <span className="text-xs text-[#7a8a6a]">
                        {quantities || `${t.harvests} ${t.harvests === 1 ? 'cosecha' : 'cosechas'}`}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Recent entries */}
              <div className="divide-y divide-[#f0f5e8]">
                {stats.harvestEntries.slice(0, 6).map(entry => {
                  const crop = getCropById(entry.cropTypeId)
                  return (
                    <div key={entry.operationId} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="text-lg" aria-hidden>{crop?.emoji ?? '🌱'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#2d4a1e] truncate">
                          {crop?.nameEs ?? entry.cropTypeId}
                          {entry.quantity ? ` — ${entry.quantity.toLocaleString()} ${entry.unit || 'lbs'}` : ''}
                        </p>
                        <p className="text-[10px] text-[#9aab8a] truncate">
                          {entry.fieldName}{entry.notes ? ` · ${entry.notes}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold text-[#7a8a6a] shrink-0">
                        {entry.date}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Crop inventory ─────────────────────────────────────── */}
          {stats.cropSummary.length > 0 && (
            <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
                <Sprout size={16} className="text-[#639922]" />
                <h2 className="text-sm font-semibold text-[#2d4a1e]">Cultivos sembrados</h2>
              </div>
              <div className="flex flex-wrap gap-2 px-5 py-4">
                {stats.cropSummary.map(c => (
                  <div
                    key={c.cropTypeId}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f5f8f0] rounded-full"
                  >
                    <span aria-hidden>{c.emoji}</span>
                    <span className="text-xs font-medium text-[#2d4a1e]">{c.nameEs}</span>
                    <span className="text-xs text-[#7a8a6a]">× {c.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Livestock ──────────────────────────────────────────── */}
          <LivestockSection />
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
      <div className="flex items-center gap-1.5 text-[#639922] mb-1.5">
        {icon}
        <span className="text-[10px] font-semibold text-[#7a8a6a] uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-[#2d4a1e]">
        {value}
        {suffix && <span className="text-xs font-medium text-[#9aab8a] ml-1">{suffix}</span>}
      </p>
    </div>
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

const SEVERITY_STYLES: Record<Recommendation['severity'], { dot: string; label: string }> = {
  urgent: { dot: 'bg-red-500', label: 'Urgente' },
  warning: { dot: 'bg-amber-400', label: 'Atención' },
  info: { dot: 'bg-[#639922]', label: 'Info' },
  tip: { dot: 'bg-[#b0c890]', label: 'Consejo' },
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
