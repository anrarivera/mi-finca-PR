import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calculator, Sprout, TrendingUp, TrendingDown, DollarSign, Scale } from 'lucide-react'
import { dateLocale, fmtNumber, localName } from '@/i18n'
import { useFieldStore } from '@/store/useFieldStore'
import { computeCropSummary } from '@/features/field/utils/rowCalculator'
import { getCropById } from '@/features/field/data/cropLibrary'
import { simulateFarm } from '@/features/simulator/engine'
import { getEconomicsForCrop } from '@/features/simulator/data/cropEconomics'
import { FARM_MODELS } from '@/features/simulator/data/farmModels'
import type { SimCropInput } from '@/features/simulator/engine'

// ──────────────────────────────────────────────────────────────────────────
// Farm viability simulator — load the real planted inventory or a pre-built
// farm model, tweak every assumption, and see projected annual economics.
// ──────────────────────────────────────────────────────────────────────────

function money(n: number): string {
  return n.toLocaleString(dateLocale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export default function SimulatorPage() {
  const { t } = useTranslation('pages')
  const fields = useFieldStore(s => s.fields)
  const [rows, setRows] = useState<SimCropInput[]>([])
  const [source, setSource] = useState<string | null>(null)

  const plantedSummary = useMemo(
    () => computeCropSummary(
      fields.flatMap(f => f.rows ?? []),
      fields.flatMap(f => f.freePlants ?? []),
      getCropById
    ),
    [fields]
  )

  function loadFromFarm() {
    setRows(plantedSummary.map(c => ({ cropTypeId: c.cropTypeId, count: c.count })))
    setSource('farm')
  }

  function loadModel(modelId: string) {
    const model = FARM_MODELS.find(m => m.id === modelId)
    if (!model) return
    setRows(model.crops.map(c => ({ ...c })))
    setSource(modelId)
  }

  function updateRow(cropTypeId: string, patch: Partial<SimCropInput>) {
    setRows(prev => prev.map(r => r.cropTypeId === cropTypeId ? { ...r, ...patch } : r))
  }

  const result = useMemo(() => simulateFarm(rows), [rows])
  const hasRows = rows.length > 0

  // The table renders in the user's stable row order — result.perCrop is
  // sorted by net, and re-sorting while someone types in an input would
  // yank the field out from under them.
  const resultByCrop = useMemo(
    () => new Map(result.perCrop.map(c => [c.cropTypeId, c])),
    [result]
  )
  const tableRows = rows
    .map(r => resultByCrop.get(r.cropTypeId))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)

  const inputClass =
    'w-full px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-xs text-[#2d4a1e] text-right focus:outline-none focus:border-[#639922] transition-colors'

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2d4a1e] flex items-center gap-2">
          <Calculator size={22} className="text-[#639922]" />
          {t('simulator.title')}
        </h1>
        <p className="text-sm text-[#9aab8a] mt-1">
          {t('simulator.subtitle')}
        </p>
      </div>

      {/* ── Source selection ─────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#e0e8d8] p-5">
        <p className="text-xs font-semibold text-[#5a6a4a] uppercase tracking-wide mb-3">
          {t('simulator.startWith')}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <button
            onClick={loadFromFarm}
            disabled={plantedSummary.length === 0}
            className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              source === 'farm'
                ? 'border-[#639922] bg-[#eaf3de]'
                : 'border-[#e0e8d8] hover:bg-[#fafcf8]'
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[#2d4a1e]">
              <Sprout size={14} className="text-[#639922]" /> {t('simulator.myFarm')}
            </span>
            <span className="text-[11px] text-[#9aab8a]">
              {plantedSummary.length === 0
                ? t('simulator.noCropsPlanted')
                : t('simulator.plantedCount', { count: plantedSummary.reduce((s, c) => s + c.count, 0) })}
            </span>
          </button>

          {FARM_MODELS.map(model => (
            <button
              key={model.id}
              onClick={() => loadModel(model.id)}
              className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors ${
                source === model.id
                  ? 'border-[#639922] bg-[#eaf3de]'
                  : 'border-[#e0e8d8] hover:bg-[#fafcf8]'
              }`}
            >
              <span className="text-sm font-semibold text-[#2d4a1e]">
                {model.emoji} {localName(model)}
              </span>
              <span className="text-[11px] text-[#9aab8a]">{model.descriptionEs}</span>
            </button>
          ))}
        </div>
      </section>

      {hasRows && (
        <>
          {/* ── Totals ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <TotalTile
              icon={<Scale size={15} />}
              label={t('simulator.totals.production')}
              value={`${fmtNumber(result.totals.annualYieldLbs, 0)} lbs`}
            />
            <TotalTile
              icon={<DollarSign size={15} />}
              label={t('simulator.totals.revenue')}
              value={money(result.totals.annualRevenue)}
            />
            <TotalTile
              icon={<TrendingDown size={15} />}
              label={t('simulator.totals.costs')}
              value={money(result.totals.annualCost)}
            />
            <TotalTile
              icon={<TrendingUp size={15} />}
              label={t('simulator.totals.net')}
              value={money(result.totals.annualNet)}
              accent={result.totals.annualNet >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {/* ── Per-crop table ──────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e0e8d8]">
              <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('simulator.perCrop.title')}</h2>
              <p className="text-[11px] text-[#9aab8a] mt-0.5">
                {t('simulator.perCrop.subtitle')}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-[#9aab8a] uppercase tracking-wide border-b border-[#f0f5e8]">
                    <th className="text-left px-5 py-2.5 font-semibold">{t('simulator.columns.crop')}</th>
                    <th className="text-right px-2 py-2.5 font-semibold">{t('simulator.columns.plants')}</th>
                    <th className="text-right px-2 py-2.5 font-semibold">{t('simulator.columns.lbsPerPlant')}</th>
                    <th className="text-right px-2 py-2.5 font-semibold">{t('simulator.columns.pricePerLb')}</th>
                    <th className="text-right px-2 py-2.5 font-semibold">{t('simulator.columns.harvestsPerYear')}</th>
                    <th className="text-right px-2 py-2.5 font-semibold">{t('simulator.columns.costPerPlant')}</th>
                    <th className="text-right px-5 py-2.5 font-semibold">{t('simulator.columns.annualNet')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f5e8]">
                  {tableRows.map(c => {
                    const crop = getCropById(c.cropTypeId)
                    const base = getEconomicsForCrop(c.cropTypeId)
                    return (
                      <tr key={c.cropTypeId}>
                        <td className="px-5 py-2 whitespace-nowrap">
                          <span aria-hidden className="mr-1.5">{crop?.emoji ?? '🌱'}</span>
                          <span className="font-medium text-[#2d4a1e]">{localName(crop, c.cropTypeId)}</span>
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} value={c.count} className={inputClass}
                            aria-label={t('simulator.aria.plantsOf', { name: localName(crop, c.cropTypeId) })}
                            onChange={e => updateRow(c.cropTypeId, { count: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} step={0.5} value={c.yieldPerPlantLbs} className={inputClass}
                            aria-label={t('simulator.aria.lbsPerPlant')}
                            onChange={e => updateRow(c.cropTypeId, { yieldPerPlantLbs: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} step={0.05} value={c.pricePerLb} className={inputClass}
                            aria-label={t('simulator.aria.pricePerLb')}
                            onChange={e => updateRow(c.cropTypeId, { pricePerLb: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} step={0.1} value={c.cyclesPerYear} className={inputClass}
                            aria-label={t('simulator.aria.cyclesPerYear')}
                            onChange={e => updateRow(c.cropTypeId, { cyclesPerYear: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} step={0.5} value={c.costPerPlantYear} className={inputClass}
                            aria-label={t('simulator.aria.costPerPlantYear')}
                            onChange={e => updateRow(c.cropTypeId, { costPerPlantYear: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className={`px-5 py-2 text-right font-semibold whitespace-nowrap ${
                          c.annualNet >= 0 ? 'text-[#2d4a1e]' : 'text-red-600'
                        }`}>
                          {money(c.annualNet)}
                          {(c.yieldPerPlantLbs !== base.yieldPerPlantLbs ||
                            c.pricePerLb !== base.pricePerLb ||
                            c.cyclesPerYear !== base.cyclesPerYear ||
                            c.costPerPlantYear !== base.costPerPlantYear) && (
                            <span className="block text-[9px] font-normal text-[#9aab8a]">{t('simulator.adjusted')}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-[11px] text-[#9aab8a] px-1">
            {t('simulator.disclaimer')}
          </p>
        </>
      )}
    </div>
  )
}

function TotalTile({ icon, label, value, accent }: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: 'positive' | 'negative'
}) {
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${
      accent === 'positive'
        ? 'bg-[#eaf3de] border-[#c8dca8]'
        : accent === 'negative'
        ? 'bg-red-50 border-red-200'
        : 'bg-white border-[#e0e8d8]'
    }`}>
      <div className="flex items-center gap-1.5 text-[#639922] mb-1.5">
        {icon}
        <span className="text-[10px] font-semibold text-[#7a8a6a] uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-lg font-bold ${accent === 'negative' ? 'text-red-700' : 'text-[#2d4a1e]'}`}>
        {value}
      </p>
    </div>
  )
}
