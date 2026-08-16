import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, PawPrint, Download } from 'lucide-react'
import { filterSelectClass } from '@/components/shared/logFilters'
import { useLivestockStore } from '@/store/useLivestockStore'
import { useCreateLivestock } from '../hooks/useLivestockApi'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import LivestockFormModal from './livestockFormModal'
import LivestockUnitRow from './livestockUnitRow'
import { toast } from '@/store/useToastStore'
import { downloadCsv } from '@/lib/csv'
import { getAnimalById } from '../data/animalLibrary'
import { localName } from '@/i18n'

// ──────────────────────────────────────────────────────────────────────────
// Livestock management — rendered as a Dashboard section. Units belong to a
// farm; the form asks for farm (when there is more than one), animal type,
// name, count and acquisition date.
// ──────────────────────────────────────────────────────────────────────────

export default function LivestockSection() {
  const { t } = useTranslation('editor')
  const units = useLivestockStore(s => s.units)
  const farms = useFarmStore(s => s.farms)
  const fields = useFieldStore(s => s.fields)
  const [adding, setAdding] = useState(false)

  // ── Filters — farm (when there are several) and animal type. ────────
  const [farmFilter, setFarmFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const presentTypes = useMemo(
    () => [...new Set(units.map(u => u.animalType))],
    [units]
  )
  const shown = units.filter(u =>
    (farmFilter === 'all' || u.farmId === farmFilter) &&
    (typeFilter === 'all' || u.animalType === typeFilter)
  )

  // Row actions (edit/move/delete/producción) live in LivestockUnitRow —
  // the same rows the corral card in the farm drawer renders.
  const createLivestock = useCreateLivestock()

  // The herd list mirrors the store, so the CSV is built client-side —
  // same shape as the rows on screen, plus corral and notes.
  function exportUnitsCsv() {
    downloadCsv(
      `mi-finca-animales-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        t('livestock.exportCols.type'), t('livestock.exportCols.name'),
        t('livestock.exportCols.count'), t('livestock.exportCols.farm'),
        t('livestock.exportCols.corral'), t('livestock.exportCols.acquired'),
        t('livestock.exportCols.notes'),
      ],
      units.map(u => [
        localName(getAnimalById(u.animalType), u.animalType),
        u.name, u.currentCount,
        farms.find(f => f.id === u.farmId)?.name ?? '',
        u.fieldId ? (fields.find(f => f.id === u.fieldId)?.name ?? '') : '',
        u.acquisitionDate,
        u.notes ?? '',
      ])
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e8d8]">
        <div className="flex items-center gap-2">
          <PawPrint size={16} className="text-[#4d7a1b]" />
          <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('livestock.title')}</h2>
          {shown.length > 0 && (
            <span className="text-xs text-[#66755a]">
              {t('livestock.total', { count: shown.reduce((s, u) => s + u.currentCount, 0) })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportUnitsCsv}
            disabled={units.length === 0}
            title={units.length === 0 ? t('livestock.nothingToExport') : t('livestock.exportCsv')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#2d4a1e] border border-[#d0dcc0] rounded-lg hover:bg-[#f0f5e8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={12} /> {t('livestock.exportCsv')}
          </button>
          <button
            onClick={() => setAdding(true)}
            disabled={farms.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={farms.length === 0 ? t('livestock.createFarmFirst') : undefined}
          >
            <Plus size={12} /> {t('livestock.add')}
          </button>
        </div>
      </div>

      {/* Filters — only meaningful once there are herds */}
      {units.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-[#f0f5e8]">
          {farms.length > 1 && (
            <select
              aria-label={t('livestock.allFarms')}
              value={farmFilter}
              onChange={e => setFarmFilter(e.target.value)}
              className={filterSelectClass}
            >
              <option value="all">{t('livestock.allFarms')}</option>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <select
            aria-label={t('livestock.allTypes')}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className={filterSelectClass}
          >
            <option value="all">{t('livestock.allTypes')}</option>
            {presentTypes.map(type => {
              const animal = getAnimalById(type)
              return (
                <option key={type} value={type}>
                  {animal ? `${animal.emoji} ${localName(animal)}` : type}
                </option>
              )
            })}
          </select>
        </div>
      )}

      {units.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-3xl mb-2">🐔🐐🐝</p>
          <p className="text-xs text-[#66755a]">
            {farms.length === 0
              ? t('livestock.emptyNoFarm')
              : t('livestock.emptyNoUnits')}
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#66755a] text-center">
          {t('livestock.noMatch')}
        </p>
      ) : (
        <div className="divide-y divide-[#f0f5e8]">
          {shown.map(unit => <LivestockUnitRow key={unit.id} unit={unit} />)}
        </div>
      )}

      {adding && (
        <LivestockFormModal
          unit={null}
          farms={farms.map(f => ({ id: f.id, name: f.name }))}
          onClose={() => setAdding(false)}
          onSave={(data) => {
            // Server assigns the UUID — no more local `lv_` ids.
            createLivestock.mutate(data, {
              onSuccess: () => toast.success(t('livestock.added', { name: data.name })),
            })
            setAdding(false)
          }}
        />
      )}
    </section>
  )
}
