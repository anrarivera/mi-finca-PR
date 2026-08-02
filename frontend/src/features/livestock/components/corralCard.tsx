import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Locate, Plus } from 'lucide-react'
import { useFarmStore, canManageStructure } from '@/store/useFarmStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { useCreateLivestock } from '../hooks/useLivestockApi'
import LivestockFormModal from './livestockFormModal'
import LivestockUnitRow from './livestockUnitRow'
import { toast } from '@/store/useToastStore'
import type { PlacedField } from '@/features/field/types'

// ──────────────────────────────────────────────────────────────────────────
// Corral card — the livestock counterpart of FieldSummaryCard in the farm
// drawer's field list. Compact: no crop rows, no operations calendar; it
// shows the herds assigned to this corral and a per-herd Producción
// shortcut. Same visual language as FieldSummaryCard (dot + name header,
// Locate button, Editar/Eliminar action row with in-card confirmation).
// ──────────────────────────────────────────────────────────────────────────

// Fixed corral tint — matches the map fill for livestock fields.
export const CORRAL_COLOR = '#8B7355'

type Props = {
  field: PlacedField
  /** Single click on the card — select the field on the map. */
  onSelect: () => void
  /** Locate button — zoom the map to the corral. */
  onZoomToField: () => void
  /** Editar — open the field editor for this corral. */
  onOpenEditor: () => void
  /** Called after the in-card confirmation — host performs the delete. */
  onDelete: () => void
}

export default function CorralCard({
  field, onSelect, onZoomToField, onOpenEditor, onDelete,
}: Props) {
  const { t } = useTranslation('editor')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Añadir animales — the same herd form the Cuaderno uses, locked to
  // this farm + corral
  const [addingAnimals, setAddingAnimals] = useState(false)
  const createLivestock = useCreateLivestock()

  const herds = useLivestockStore(s => s.units)
    .filter(u => u.fieldId === field.id)

  const cardFarm = useFarmStore(s => s.farms.find(f => f.id === field.farmId))
  const canManage = canManageStructure(cardFarm)

  return (
    <div
      onClick={onSelect}
      className="px-4 py-3 hover:bg-[#fafcf8] transition-colors cursor-pointer"
    >
      {/* Header — dot + name + Corral badge + locate */}
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <div className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: CORRAL_COLOR }}
        />
        <span className="text-sm font-medium text-[#2d4a1e] truncate">{field.name}</span>
        <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[#f0ebe2] text-[9px] font-semibold text-[#8B7355] uppercase tracking-wide">
          {t('corral.badge')}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onZoomToField() }}
          onDoubleClick={(e) => e.stopPropagation()}
          title={t('corral.viewOnMap')}
          className="shrink-0 p-1 pointer-coarse:p-2 rounded text-[#9aab8a] hover:text-[#639922] hover:bg-[#eaf3de] transition-colors"
        >
          <Locate size={12} />
        </button>
      </div>

      {/* Herds assigned to this corral */}
      {herds.length === 0 ? (
        <p className="text-[10px] text-[#9aab8a] mb-2.5">{t('corral.empty')}</p>
      ) : (
        <div className="flex flex-col gap-1 mb-2.5">
          {herds.map(unit => (
            <LivestockUnitRow key={unit.id} unit={unit} dense showFarm={false} showCorral={false} />
          ))}
        </div>
      )}

      {/* Add animals right here — no trip to the Cuaderno needed */}
      {canManage && (
        <button
          onClick={(e) => { e.stopPropagation(); setAddingAnimals(true) }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 pointer-coarse:py-2.5 mb-2.5 text-[10px] font-medium text-[#8B7355] border border-[#e0d8c8] rounded-lg hover:bg-[#f5efe5] transition-colors"
        >
          <Plus size={10} /> {t('corral.addAnimals')}
        </button>
      )}

      {/* Actions — same styles as FieldSummaryCard's action row */}
      {canManage && (!confirmDelete ? (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onOpenEditor() }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 pointer-coarse:py-2.5 text-[10px] text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
          >
            <Pencil size={10} /> {t('corral.edit')}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 pointer-coarse:py-2.5 text-[10px] text-[#9aab8a] border border-[#e0e8d8] rounded-lg hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={10} /> {t('corral.delete')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-red-500 text-center">
            {t('corral.confirmDelete', { name: field.name })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="flex-1 py-1.5 pointer-coarse:py-2.5 text-[10px] text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              {t('corral.confirmDeleteYes')}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
              className="flex-1 py-1.5 pointer-coarse:py-2.5 text-[10px] text-[#5a6a4a] border border-[#e0e8d8] rounded-lg hover:bg-[#f5f8f0] transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ))}

      {/* Portaled, but React portals bubble events through the REACT tree —
          fence them off so modal clicks don't select the card. */}
      <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        {addingAnimals && (
          <LivestockFormModal
            unit={null}
            farms={[]}
            fixedFarmId={field.farmId}
            fixedFieldId={field.id}
            onClose={() => setAddingAnimals(false)}
            onSave={(data) => {
              createLivestock.mutate(data, {
                onSuccess: () => toast.success(t('livestock.added', { name: data.name })),
              })
              setAddingAnimals(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
