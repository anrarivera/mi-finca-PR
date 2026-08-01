import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, PawPrint, ClipboardList } from 'lucide-react'
import { useLivestockStore } from '@/store/useLivestockStore'
import { useCreateLivestock, useUpdateLivestock, useDeleteLivestock } from '../hooks/useLivestockApi'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { getAnimalById } from '../data/animalLibrary'
import ProductionModal from './productionModal'
import LivestockFormModal from './livestockFormModal'
import { useConfirm } from '@/components/shared/confirmDialog'
import { toast } from '@/store/useToastStore'
import type { LivestockUnit } from '../types'
import { localName, localSingular } from '@/i18n'

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
  const { confirm, confirmDialog } = useConfirm()
  const [editing, setEditing] = useState<LivestockUnit | 'new' | null>(null)
  // Registrar producción — per unit
  const [producing, setProducing] = useState<LivestockUnit | null>(null)

  // Persistence now goes through the API (useLivestockApi) instead of only
  // localStorage — the hooks sync the Zustand store on success.
  const createLivestock = useCreateLivestock()
  const updateLivestock = useUpdateLivestock()
  const deleteLivestock = useDeleteLivestock()

  async function handleDelete(unit: LivestockUnit) {
    const animal = getAnimalById(unit.animalType)
    const ok = await confirm({
      title: t('livestock.deleteTitle', { name: unit.name }),
      message: t('livestock.deleteMessage', {
        animal: localName(animal).toLowerCase() || t('livestock.animalsFallback'),
      }),
      confirmLabel: t('livestock.delete'),
      danger: true,
    })
    if (!ok) return
    deleteLivestock.mutate(
      { id: unit.id, farmId: unit.farmId },
      { onSuccess: () => toast.success(t('livestock.deleted', { name: unit.name })) }
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e8d8]">
        <div className="flex items-center gap-2">
          <PawPrint size={16} className="text-[#639922]" />
          <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('livestock.title')}</h2>
          {units.length > 0 && (
            <span className="text-xs text-[#9aab8a]">
              {t('livestock.total', { count: units.reduce((s, u) => s + u.currentCount, 0) })}
            </span>
          )}
        </div>
        <button
          onClick={() => setEditing('new')}
          disabled={farms.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={farms.length === 0 ? t('livestock.createFarmFirst') : undefined}
        >
          <Plus size={12} /> {t('livestock.add')}
        </button>
      </div>

      {units.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-3xl mb-2">🐔🐐🐝</p>
          <p className="text-xs text-[#9aab8a]">
            {farms.length === 0
              ? t('livestock.emptyNoFarm')
              : t('livestock.emptyNoUnits')}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#f0f5e8]">
          {units.map(unit => {
            const animal = getAnimalById(unit.animalType)
            const farm = farms.find(f => f.id === unit.farmId)
            const corral = unit.fieldId ? fields.find(f => f.id === unit.fieldId) : undefined
            return (
              <div key={unit.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-2xl" aria-hidden>{animal?.emoji ?? '🐾'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2d4a1e] truncate">{unit.name}</p>
                  <p className="text-[11px] text-[#9aab8a] truncate">
                    {unit.currentCount} {animal ? (unit.currentCount === 1 ? localSingular(animal) : localName(animal).toLowerCase()) : t('livestock.animalsFallback')}
                    {farm ? ` · ${farm.name}` : ''}
                    {corral ? ` · 🏠 ${corral.name}` : ''}
                    {unit.notes ? ` · ${unit.notes}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setProducing(unit)}
                  title={t('production.title', { name: unit.name })}
                  className="flex items-center gap-1 px-2 py-1.5 pointer-coarse:px-3 pointer-coarse:py-2.5 text-[10px] font-medium text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
                >
                  <ClipboardList size={11} /> {t('production.action')}
                </button>
                <button
                  onClick={() => setEditing(unit)}
                  aria-label={t('livestock.editAria', { name: unit.name })}
                  className="w-7 h-7 pointer-coarse:w-10 pointer-coarse:h-10 flex items-center justify-center rounded-lg text-[#9aab8a] hover:text-[#2d4a1e] hover:bg-[#f0f5e8] transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleDelete(unit)}
                  aria-label={t('livestock.deleteAria', { name: unit.name })}
                  className="w-7 h-7 pointer-coarse:w-10 pointer-coarse:h-10 flex items-center justify-center rounded-lg text-[#9aab8a] hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <LivestockFormModal
          unit={editing === 'new' ? null : editing}
          farms={farms.map(f => ({ id: f.id, name: f.name }))}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === 'new') {
              // Server assigns the UUID — no more local `lv_` ids.
              createLivestock.mutate(data, {
                onSuccess: () => toast.success(t('livestock.added', { name: data.name })),
              })
            } else {
              // farmId is fixed on edit (units can't move between farms).
              const { farmId: _ignored, ...updates } = data
              updateLivestock.mutate(
                { id: editing.id, farmId: editing.farmId, updates },
                { onSuccess: () => toast.success(t('livestock.updated', { name: data.name })) }
              )
            }
            setEditing(null)
          }}
        />
      )}

      {producing && (
        <ProductionModal unit={producing} onClose={() => setProducing(null)} />
      )}

      {confirmDialog}
    </section>
  )
}
