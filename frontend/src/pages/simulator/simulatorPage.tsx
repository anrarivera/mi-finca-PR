import { useMemo, useState } from 'react'
import { Calculator, Sprout, TrendingUp, TrendingDown, DollarSign, Scale } from 'lucide-react'
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
  return n.toLocaleString('es-PR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export default function SimulatorPage() {
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

  const inputClass =
    'w-full px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-xs text-[#2d4a1e] text-right focus:outline-none focus:border-[#639922] transition-colors'

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2d4a1e] flex items-center gap-2">
          <Calculator size={22} className="text-[#639922]" />
          Simulador de viabilidad
        </h1>
        <p className="text-sm text-[#9aab8a] mt-1">
          Proyecta producción, ingresos y costos anuales. Los números son estimados
          orientativos — ajústalos a tu realidad.
        </p>
      </div>

      {/* ── Source selection ─────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#e0e8d8] p-5">
        <p className="text-xs font-semibold text-[#5a6a4a] uppercase tracking-wide mb-3">
          Empieza con…
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
              <Sprout size={14} className="text-[#639922]" /> Mi finca actual
            </span>
            <span className="text-[11px] text-[#9aab8a]">
              {plantedSummary.length === 0
                ? 'Aún no tienes cultivos sembrados'
                : `${plantedSummary.reduce((s, c) => s + c.count, 0)} plantas sembradas en tus campos`}
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
                {model.emoji} {model.nameEs}
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
              label="Producción anual"
              value={`${Math.round(result.totals.annualYieldLbs).toLocaleString()} lbs`}
            />
            <TotalTile
              icon={<DollarSign size={15} />}
              label="Ingresos"
              value={money(result.totals.annualRevenue)}
            />
            <TotalTile
              icon={<TrendingDown size={15} />}
              label="Costos"
              value={money(result.totals.annualCost)}
            />
            <TotalTile
              icon={<TrendingUp size={15} />}
              label="Neto anual"
              value={money(result.totals.annualNet)}
              accent={result.totals.annualNet >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {/* ── Per-crop table ──────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e0e8d8]">
              <h2 className="text-sm font-semibold text-[#2d4a1e]">Supuestos por cultivo</h2>
              <p className="text-[11px] text-[#9aab8a] mt-0.5">
                Edita cualquier número — la proyección se recalcula al instante.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-[#9aab8a] uppercase tracking-wide border-b border-[#f0f5e8]">
                    <th className="text-left px-5 py-2.5 font-semibold">Cultivo</th>
                    <th className="text-right px-2 py-2.5 font-semibold">Plantas</th>
                    <th className="text-right px-2 py-2.5 font-semibold">lbs/planta</th>
                    <th className="text-right px-2 py-2.5 font-semibold">$/lb</th>
                    <th className="text-right px-2 py-2.5 font-semibold">Cosechas/año</th>
                    <th className="text-right px-2 py-2.5 font-semibold">Costo/planta</th>
                    <th className="text-right px-5 py-2.5 font-semibold">Neto anual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f5e8]">
                  {result.perCrop.map(c => {
                    const crop = getCropById(c.cropTypeId)
                    const base = getEconomicsForCrop(c.cropTypeId)
                    return (
                      <tr key={c.cropTypeId}>
                        <td className="px-5 py-2 whitespace-nowrap">
                          <span aria-hidden className="mr-1.5">{crop?.emoji ?? '🌱'}</span>
                          <span className="font-medium text-[#2d4a1e]">{crop?.nameEs ?? c.cropTypeId}</span>
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} value={c.count} className={inputClass}
                            aria-label={`Plantas de ${crop?.nameEs ?? c.cropTypeId}`}
                            onChange={e => updateRow(c.cropTypeId, { count: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} step={0.5} value={c.yieldPerPlantLbs} className={inputClass}
                            aria-label="Libras por planta"
                            onChange={e => updateRow(c.cropTypeId, { yieldPerPlantLbs: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} step={0.05} value={c.pricePerLb} className={inputClass}
                            aria-label="Precio por libra"
                            onChange={e => updateRow(c.cropTypeId, { pricePerLb: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} step={0.1} value={c.cyclesPerYear} className={inputClass}
                            aria-label="Cosechas por año"
                            onChange={e => updateRow(c.cropTypeId, { cyclesPerYear: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="px-2 py-2 w-20">
                          <input type="number" min={0} step={0.5} value={c.costPerPlantYear} className={inputClass}
                            aria-label="Costo por planta al año"
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
                            <span className="block text-[9px] font-normal text-[#9aab8a]">ajustado</span>
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
            ⚠️ Proyecciones orientativas basadas en promedios generales — los resultados
            reales varían con el terreno, el clima y el mercado. Consulta un agrónomo
            licenciado antes de tomar decisiones de inversión.
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
