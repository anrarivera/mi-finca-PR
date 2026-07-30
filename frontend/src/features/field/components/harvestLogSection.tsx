import { useMemo } from 'react'
import { useFieldStore } from '@/store/useFieldStore'
import { getCropById } from '../data/cropLibrary'
import { collectHarvestEntries, totalHarvestsByCrop } from '../utils/harvestLog'

// ──────────────────────────────────────────────────────────────────────────
// Cosechas registradas — totals per crop plus the most recent entries.
// Extracted from the dashboard for the cuaderno de campo's Cosechas tab.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  /** How many recent entries to list (default 6, the dashboard's cap). */
  limit?: number
}

export default function HarvestLogSection({ limit = 6 }: Props) {
  const fields = useFieldStore(s => s.fields)

  const { entries, totals } = useMemo(() => {
    const entries = collectHarvestEntries(fields)
    return { entries, totals: totalHarvestsByCrop(entries) }
  }, [fields])

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
      {entries.length > 0 && (
      <div className="flex flex-wrap gap-2 px-5 py-4 border-b border-[#f0f5e8]">
        {totals.map(t => {
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
      )}

      {/* Recent entries */}
      <div className="divide-y divide-[#f0f5e8]">
        {entries.slice(0, limit).map(entry => {
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
  )
}
