import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Pencil, Download, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from '@/store/useToastStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useFarmStore } from '@/store/useFarmStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { getAnimalById } from '@/features/livestock/data/animalLibrary'
import { getCropById } from '../data/cropLibrary'
import PriceInput, { formatMoney } from './priceInput'
import { dateLocale, fmtNumber, localName } from '@/i18n'

// ──────────────────────────────────────────────────────────────────────────
// Producción registrada — the unified production ledger, read STRAIGHT from
// GET /farms/:id/harvests: crop harvests (cropTypeId) and animal production
// (livestockUnitId + productId) in one server-owned list. Each row shows
// its sale revenue when logged (— when not), summed into the "Ingresos"
// line with a per-crop/product breakdown; the pencil opens an inline
// PriceInput that PATCHes /harvests/:id { revenue } for later sales.
// ──────────────────────────────────────────────────────────────────────────

// Backend harvest_yields row (backend/src/routes/harvests.ts). Exported
// for the API contract test.
export type ApiHarvestRow = {
  id: string
  farmId: string
  fieldId: string | null
  operationId: string | null
  cropTypeId: string | null
  livestockUnitId: string | null
  productId: string | null
  quantity: number
  unit: string
  /** Total sale revenue in dollars; null = not sold / not recorded. */
  revenue: number | null
  harvestDate: string
  notes: string | null
}

// The whole ledger across every farm, newest first.
function useHarvestLedger(): ApiHarvestRow[] {
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
    () => [...(data ?? [])].sort((a, b) => b.harvestDate.localeCompare(a.harvestDate)),
    [data]
  )
}

type Props = {
  /** How many recent entries to list (default 6, the dashboard's cap). */
  limit?: number
}

export default function HarvestLogSection({ limit = 6 }: Props) {
  const { t } = useTranslation('field')
  // Product names (Huevos/Leche/...) live in the editor namespace, shared
  // with the production modal — one dictionary, no duplicated labels.
  const { t: tEditor } = useTranslation('editor')
  const fields = useFieldStore(s => s.fields)
  const livestockUnits = useLivestockStore(s => s.units)
  const entries = useHarvestLedger()

  // CSV export — the active farm's ledger, same pattern as the other
  // exports (api.download carries auth + the silent token refresh).
  const activeFarm = useFarmStore(s => s.activeFarm)
  const exportCsv = useMutation({
    mutationFn: async () => {
      if (!activeFarm) return
      const { blob, filename } =
        await api.download(`/api/v1/farms/${activeFarm.id}/harvests/export?format=csv`)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename ?? 'produccion.csv'
      a.click()
      URL.revokeObjectURL(a.href)
    },
    onError: () => toast.error(t('harvestLog.exportError')),
  })

  // Inline revenue editing: one row at a time, draft = total dollars.
  const [editing, setEditing] = useState<{ id: string; draft: number | null } | null>(null)
  const queryClient = useQueryClient()
  const saveRevenue = useMutation({
    mutationFn: (vars: { farmId: string; id: string; revenue: number | null }) =>
      api.patch<ApiHarvestRow>(
        `/api/v1/farms/${vars.farmId}/harvests/${vars.id}`,
        { revenue: vars.revenue }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['harvests'] })
      setEditing(null)
    },
  })

  // Display label per row: crop name, or the animal product's name.
  function rowLabel(row: ApiHarvestRow): string {
    if (row.cropTypeId) {
      return localName(getCropById(row.cropTypeId), row.cropTypeId)
    }
    if (row.productId) {
      return tEditor(`production.products.${row.productId}`, { defaultValue: row.productId })
    }
    return row.unit
  }

  function rowEmoji(row: ApiHarvestRow): string {
    if (row.cropTypeId) return getCropById(row.cropTypeId)?.emoji ?? '🌱'
    const unit = livestockUnits.find(u => u.id === row.livestockUnitId)
    return (unit ? getAnimalById(unit.animalType)?.emoji : undefined) ?? '🐾'
  }

  // Ingresos: total of the recorded revenues + a per-crop/product breakdown.
  const income = useMemo(() => {
    let total = 0
    const byLabel = new Map<string, number>()
    for (const row of entries) {
      if (row.revenue == null) continue
      total += row.revenue
      const key = rowLabel(row)
      byLabel.set(key, (byLabel.get(key) ?? 0) + row.revenue)
    }
    return {
      total,
      breakdown: [...byLabel.entries()].sort((a, b) => b[1] - a[1]),
      hasAny: byLabel.size > 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, livestockUnits, tEditor])

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#e0e8d8]">
        <span className="text-base" aria-hidden>🧺</span>
        <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('harvestLog.title')}</h2>
        <span className="text-xs text-[#9aab8a]">
          {t('harvestLog.count', { count: entries.length })}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => exportCsv.mutate()}
          disabled={entries.length === 0 || !activeFarm || exportCsv.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#2d4a1e] border border-[#d0dcc0] rounded-lg hover:bg-[#f0f5e8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={entries.length === 0 ? t('log.nothingToExport') : t('log.downloadCsv')}
        >
          {exportCsv.isPending
            ? <Loader2 size={12} className="animate-spin" />
            : <Download size={12} />}
          {t('log.exportCsv')}
        </button>
      </div>

      {/* Ingresos — sum of every recorded sale, broken down by product */}
      {income.hasAny && (
        <div className="px-5 py-3 border-b border-[#f0f5e8] flex flex-col gap-2">
          <p className="text-xs font-semibold text-[#2d4a1e]">
            {t('harvestLog.income')}: <span className="text-[#639922]">${formatMoney(income.total)}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {income.breakdown.map(([label, amount]) => (
              <span key={label}
                className="px-2 py-0.5 bg-[#f5f8f0] rounded-full text-[10px] text-[#5a6a4a]"
              >
                {label}: <span className="font-semibold text-[#2d4a1e]">${formatMoney(amount)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <p className="px-5 py-6 text-xs text-[#9aab8a] text-center">
          {t('harvestLog.empty')}
        </p>
      )}

      {/* Recent entries — crop harvests and animal production, one list */}
      <div className="divide-y divide-[#f0f5e8]">
        {entries.slice(0, limit).map(row => {
          const field = row.fieldId ? fields.find(f => f.id === row.fieldId) : undefined
          const unit = row.livestockUnitId
            ? livestockUnits.find(u => u.id === row.livestockUnitId)
            : undefined
          const dateFormatted = new Date(row.harvestDate.split('T')[0] + 'T12:00:00')
            .toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
          const subtitle = [
            field?.name ?? unit?.name,
            dateFormatted,
            row.quantity ? `${fmtNumber(row.quantity)} ${row.unit}` : null,
            row.notes,
          ].filter(Boolean).join(' · ')
          const isEditing = editing?.id === row.id

          return (
            <div key={row.id} className="px-5 py-2.5">
              <div className="flex items-center gap-3">
                <span className="text-lg" aria-hidden>{rowEmoji(row)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#2d4a1e] truncate">
                    {rowLabel(row)}
                  </p>
                  <p className="text-[10px] text-[#9aab8a] truncate">{subtitle}</p>
                </div>
                {/* Sale revenue — em dash until it's recorded */}
                {row.revenue != null ? (
                  <span className="text-xs font-semibold text-[#2d4a1e] shrink-0">
                    ${formatMoney(row.revenue)}
                  </span>
                ) : (
                  <span className="text-xs text-[#c0d0b0] shrink-0">—</span>
                )}
                <button
                  onClick={() => setEditing(isEditing ? null : { id: row.id, draft: row.revenue })}
                  title={t('harvestLog.editRevenue')}
                  className="shrink-0 p-1 pointer-coarse:p-2 rounded text-[#9aab8a] hover:text-[#639922] hover:bg-[#eaf3de] transition-colors"
                >
                  <Pencil size={11} />
                </button>
              </div>

              {/* Inline sale-price editor — PATCHes the ledger row */}
              {isEditing && (
                <div className="mt-2 ml-8 flex flex-col gap-2 bg-[#fafcf8] border border-[#e0e8d8] rounded-lg px-3 py-2.5">
                  <PriceInput
                    quantity={row.quantity > 0 ? row.quantity : null}
                    value={editing.draft}
                    onChange={draft => setEditing({ id: row.id, draft })}
                    unitLabel={row.unit}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditing(null)}
                      className="flex-1 py-1.5 text-[10px] text-[#5a6a4a] border border-[#e0e8d8] rounded-lg hover:bg-[#f0f5e8] transition-colors"
                    >
                      {t('actions.cancel')}
                    </button>
                    <button
                      onClick={() => saveRevenue.mutate({
                        farmId: row.farmId, id: row.id, revenue: editing.draft,
                      })}
                      disabled={saveRevenue.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-medium bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-40"
                    >
                      <Check size={10} />
                      {t('actions.save')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
