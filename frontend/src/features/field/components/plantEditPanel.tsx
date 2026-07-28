// ──────────────────────────────────────────────────────────────────────────
// Single-plant editor.
//
// Opens when the user clicks an individual plant on the canvas. Lets them
// change just that plant's crop or remove it. Works for both row plants and
// free plants (the parent resolves the plant and wires the handlers).
// Removal asks WHY (died / replaced / harvested / other) — the parent logs
// the reason to the operations history when the field is saved.
// ──────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { X, Trash2, Check } from 'lucide-react'
import CropSelector from './cropSelector'
import { getCropById } from '../data/cropLibrary'

export type PlantRemovalReason = 'died' | 'replaced' | 'harvested' | 'other'

export const REMOVAL_REASONS: Array<{
  id: PlantRemovalReason
  labelEs: string
  emoji: string
}> = [
  { id: 'died', labelEs: 'Murió', emoji: '🥀' },
  { id: 'replaced', labelEs: 'Reemplazada', emoji: '🔄' },
  { id: 'harvested', labelEs: 'Cosechada', emoji: '🧺' },
  { id: 'other', labelEs: 'Otra razón', emoji: '📋' },
]

type Props = {
  plant: { id: string; cropTypeId: string }
  onChangeCrop: (cropTypeId: string) => void
  /** Remove the plant, recording why. */
  onDelete: (reason: PlantRemovalReason, notes?: string) => void
  onClose: () => void
}

export default function PlantEditPanel({ plant, onChangeCrop, onDelete, onClose }: Props) {
  const crop = getCropById(plant.cropTypeId)
  const [removing, setRemoving] = useState(false)
  const [reason, setReason] = useState<PlantRemovalReason>('died')
  const [notes, setNotes] = useState('')

  return (
    <div className="absolute right-4 top-4 z-10 w-56 bg-white rounded-xl border border-[#e0e8d8] shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">{crop?.emoji ?? '🌱'}</span>
          <p className="text-xs font-semibold text-[#2d4a1e] truncate">
            {crop?.nameEs ?? 'Planta'}
          </p>
        </div>
        <button onClick={onClose}
          className="w-5 h-5 flex items-center justify-center text-[#9aab8a] hover:text-red-400 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {!removing ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">Cultivo</label>
              <CropSelector
                value={plant.cropTypeId}
                onChange={(id) => { if (id) onChangeCrop(id) }}
                placeholder="Seleccionar cultivo"
              />
            </div>

            <button onClick={() => setRemoving(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] border border-[#e0e8d8] rounded-lg hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} /> Eliminar planta
            </button>
          </>
        ) : (
          <>
            {/* Removal reason — recorded in the operations log on save */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                ¿Por qué se elimina?
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {REMOVAL_REASONS.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReason(r.id)}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border text-[10px] transition-colors ${
                      reason === r.id
                        ? 'border-[#639922] bg-[#eaf3de] text-[#2d4a1e] font-medium'
                        : 'border-[#e0e8d8] text-[#5a6a4a] hover:border-[#c8dca8] hover:bg-[#fafcf8]'
                    }`}
                  >
                    <span className="text-base">{r.emoji}</span>
                    {r.labelEs}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Nota <span className="text-[#9aab8a] font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej. Hongos en el tallo"
                className="w-full px-2.5 py-1.5 rounded-lg border border-[#d0dcc0] text-xs text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => onDelete(reason, notes.trim() || undefined)}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
              >
                <Check size={13} /> Confirmar eliminación
              </button>
              <button
                onClick={() => setRemoving(false)}
                className="w-full py-1.5 text-xs text-[#5a6a4a] hover:bg-[#f5f8f0] rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
