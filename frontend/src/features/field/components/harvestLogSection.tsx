import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore } from '@/store/useFarmStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { getAnimalById } from '@/features/livestock/data/animalLibrary'
import { getCropById } from '../data/cropLibrary'
import { collectHarvestEntries, totalHarvestsByCrop, type HarvestEntry } from '../utils/harvestLog'
import { localName } from '@/i18n'

// ──────────────────────────────────────────────────────────────────────────
// Producción registrada — the unified ledger: crop harvests (derived from
// completed 'harvest' operations, as before) merged with animal production
// rows from GET /farms/:id/harvests (rows with productId + livestockUnitId
// instead of cropTypeId). Totals stay per crop; production entries list
// alongside by date.
// ──────────────────────────────────────────────────────────────────────────

// Backend harvest_yields row (backend/src/routes/harvests.ts).
type ApiHarvestRow = {
  id: string
  farmId: string
  fieldId: string | null
  operationId: string | null
  cropTypeId: string | null
  livestockUnitId: string | null
  productId: string | null
  quantity: number
  unit: string
  harvestDate: string
  notes: string | null
}

// Animal production rows across every farm. Crop rows are filtered OUT —
// those are already derived (with richer field context) from the fields'
// completed operations, and would double-count here.
function useProductionEntries(): HarvestEntry[] {
  const farms = useFarmStore(s => s.farms)
  const farmIds = farms.map(f => f.id)

  const { data } = useQuery({
    queryKey: ['harvests', [...farmIds].sort().join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        farmIds.map(id => api.get<ApiHarvestRow[]>(`/api/v1/farms/${id}/harvests`))
      )
      return results.flat()
    },
    enabled: farmIds.length > 0,
    staleTime: 60 * 1000,
  })

  return useMemo(
    () => (data ?? [])
      .filter(r => r.productId)
      .map(r => ({
        operationId: r.operationId ?? r.id,
        fieldId: r.fieldId ?? '',
        fieldName: '',
        cropTypeId: '',
        date: r.harvestDate.split('T')[0],
        quantity: r.quantity,
        unit: r.unit,
        notes: r.notes ?? undefined,
        productId: r.productId!,
        livestockUnitId: r.livestockUnitId ?? undefined,
      })),
    [data]
  )
}

type Props = {
  /** How many recent entries to list (default 6, the dashboard's cap). */
  limit?: number
}

export default function HarvestLogSection({ limit = 6 }: Props) {
  const { t } = useTranslation('editor')
  const fields = useFieldStore(s => s.fields)
  const livestockUnits = useLivestockStore(s => s.units)
  const productionEntries = useProductionEntries()

  const { entries, totals } = useMemo(() => {
    const cropEntries = collectHarvestEntries(fields)
    const entries = [...cropEntries, ...productionEntries]
      .sort((a, b) => b.date.localeCompare(a.date))
    return { entries, totals: totalHarvestsByCrop(cropEntries) }
  }, [fields, productionEntries])

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <span className="text-base" aria-hidden>🧺</span>
        <h2 className="text-sm font-semibold text-[#2d4a1e]">Cosechas registradas</h2>
        <span className="text-xs text-[#9aab8a]">
          {entries.length} en total
        </span>
      </div>

      {entries.length === 0 && (
        <p className="px-5 py-6 text-xs text-[#9aab8a] text-center">
          Sin cosechas registradas todavía. Completa una labor de cosecha
          desde el mapa y aparecerá aquí.
        </p>
      )}

      {/* Totals per crop */}
      {totals.length > 0 && (
      <div className="flex flex-wrap gap-2 px-5 py-4 border-b border-[#f0f5e8]">
        {totals.map(total => {
          const crop = getCropById(total.cropTypeId)
          const quantities = Object.entries(total.totalsByUnit)
            .map(([unit, qty]) => `${qty.toLocaleString()} ${unit}`)
            .join(' + ')
          return (
            <div key={total.cropTypeId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f5f8f0] rounded-full"
            >
              <span aria-hidden>{crop?.emoji ?? '🌱'}</span>
              <span className="text-xs font-medium text-[#2d4a1e]">
                {localName(crop, total.cropTypeId)}
              </span>
              <span className="text-xs text-[#7a8a6a]">
                {quantities || `${total.harvests} ${total.harvests === 1 ? 'cosecha' : 'cosechas'}`}
              </span>
            </div>
          )
        })}
      </div>
      )}

      {/* Recent entries */}
      <div className="divide-y divide-[#f0f5e8]">
        {entries.slice(0, limit).map(entry => {
          // Animal production row — animal emoji + product label; the crop
          // row keeps its crop name. Fallback: raw productId if the herd
          // was deleted.
          if (entry.productId) {
            const unit = livestockUnits.find(u => u.id === entry.livestockUnitId)
            const animal = unit ? getAnimalById(unit.animalType) : undefined
            const label = unit
              ? t(`production.products.${entry.productId}`, { defaultValue: entry.productId })
              : entry.productId
            return (
              <div key={entry.operationId} className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-lg" aria-hidden>{animal?.emoji ?? '🐾'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#2d4a1e] truncate">
                    {label}
                    {entry.quantity ? ` — ${entry.quantity.toLocaleString()} ${entry.unit || 'lbs'}` : ''}
                  </p>
                  <p className="text-[10px] text-[#9aab8a] truncate">
                    {unit?.name ?? ''}{entry.notes ? `${unit ? ' · ' : ''}${entry.notes}` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-[#7a8a6a] shrink-0">
                  {entry.date}
                </span>
              </div>
            )
          }
          const crop = getCropById(entry.cropTypeId)
          return (
            <div key={entry.operationId} className="flex items-center gap-3 px-5 py-2.5">
              <span className="text-lg" aria-hidden>{crop?.emoji ?? '🌱'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#2d4a1e] truncate">
                  {localName(crop, entry.cropTypeId)}
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
  )
}
