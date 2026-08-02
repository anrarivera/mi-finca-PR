import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, ClipboardList } from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useUpdateLivestock, useDeleteLivestock } from '../hooks/useLivestockApi'
import { getAnimalById } from '../data/animalLibrary'
import ProductionModal from './productionModal'
import LivestockFormModal from './livestockFormModal'
import { useConfirm } from '@/components/shared/confirmDialog'
import { toast } from '@/store/useToastStore'
import { localName, localSingular } from '@/i18n'
import type { LivestockUnit } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Self-contained herd row — ONE component for the Cuaderno's Animales tab
// and the corral card in the farm drawer. Owns its actions: Producción,
// edit (including moving the herd to another corral — pasture rotation),
// and delete with confirmation. All its modals are portaled, and the root
// fences clicks so hosts inside clickable cards stay unaffected.
// ──────────────────────────────────────────────────────────────────────────

export default function LivestockUnitRow({
  unit, showFarm = true, showCorral = true, dense = false,
}: {
  unit: LivestockUnit
  /** Hide the farm name (e.g. inside a farm-scoped host). */
  showFarm?: boolean
  /** Hide the corral name (e.g. inside the corral's own card). */
  showCorral?: boolean
  /** Tighter paddings for narrow hosts (drawer cards). */
  dense?: boolean
}) {
  const { t } = useTranslation('editor')
  const [editing, setEditing] = useState(false)
  const [producing, setProducing] = useState(false)
  const { confirm, confirmDialog } = useConfirm()

  const farms = useFarmStore(s => s.farms)
  const fields = useFieldStore(s => s.fields)
  const updateLivestock = useUpdateLivestock()
  const deleteLivestock = useDeleteLivestock()

  const animal = getAnimalById(unit.animalType)
  const farm = farms.find(f => f.id === unit.farmId)
  const corral = unit.fieldId ? fields.find(f => f.id === unit.fieldId) : undefined

  async function handleDelete() {
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
    <div
      // Hosts include clickable cards (corral card selects its field on
      // click) — the row's own interactions must never bubble into them.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`flex items-center ${dense ? 'gap-2 px-2 py-2 bg-[#f5f8f0] rounded-lg' : 'gap-3 px-5 py-3'} min-w-0`}
    >
      <span className={dense ? 'text-lg shrink-0' : 'text-2xl shrink-0'} aria-hidden>
        {animal?.emoji ?? '🐾'}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-[#2d4a1e] truncate ${dense ? 'text-[11px]' : 'text-sm'}`}>
          {unit.name}
        </p>
        <p className={`text-[#9aab8a] truncate ${dense ? 'text-[10px]' : 'text-[11px]'}`}>
          {unit.currentCount} {animal ? (unit.currentCount === 1 ? localSingular(animal) : localName(animal).toLowerCase()) : t('livestock.animalsFallback')}
          {showFarm && farm ? ` · ${farm.name}` : ''}
          {showCorral && corral ? ` · 🏠 ${corral.name}` : ''}
          {unit.notes ? ` · ${unit.notes}` : ''}
        </p>
      </div>

      <button
        onClick={() => setProducing(true)}
        title={t('production.title', { name: unit.name })}
        className={`flex items-center gap-1 font-medium text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors shrink-0 ${
          dense ? 'px-1.5 py-1 pointer-coarse:px-2.5 pointer-coarse:py-2 text-[9px]' : 'px-2 py-1.5 pointer-coarse:px-3 pointer-coarse:py-2.5 text-[10px]'
        }`}
      >
        <ClipboardList size={dense ? 9 : 11} /> {t('production.action')}
      </button>
      <button
        onClick={() => setEditing(true)}
        aria-label={t('livestock.editAria', { name: unit.name })}
        className={`${dense ? 'w-6 h-6' : 'w-7 h-7'} pointer-coarse:w-10 pointer-coarse:h-10 flex items-center justify-center rounded-lg text-[#9aab8a] hover:text-[#2d4a1e] hover:bg-[#f0f5e8] transition-colors shrink-0`}
      >
        <Pencil size={dense ? 11 : 13} />
      </button>
      <button
        onClick={handleDelete}
        aria-label={t('livestock.deleteAria', { name: unit.name })}
        className={`${dense ? 'w-6 h-6' : 'w-7 h-7'} pointer-coarse:w-10 pointer-coarse:h-10 flex items-center justify-center rounded-lg text-[#9aab8a] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0`}
      >
        <Trash2 size={dense ? 11 : 13} />
      </button>

      {editing && (
        <LivestockFormModal
          unit={unit}
          farms={farms.map(f => ({ id: f.id, name: f.name }))}
          onClose={() => setEditing(false)}
          onSave={(data) => {
            // farmId is fixed on edit (units can't move between farms) —
            // but fieldId can change: that's how herds rotate corrales.
            const { farmId: _ignored, ...updates } = data
            updateLivestock.mutate(
              { id: unit.id, farmId: unit.farmId, updates },
              { onSuccess: () => toast.success(t('livestock.updated', { name: data.name })) }
            )
            setEditing(false)
          }}
        />
      )}
      {producing && (
        <ProductionModal unit={unit} onClose={() => setProducing(false)} />
      )}
      {confirmDialog}
    </div>
  )
}
