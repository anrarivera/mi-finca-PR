// ──────────────────────────────────────────────────────────────────────────
// Added by Claude — single-plant editor.
//
// Opens when the user clicks an individual plant on the canvas. Lets them
// change just that plant's crop or delete it. Works for both row plants and
// free plants (the parent resolves the plant and wires the handlers).
// ──────────────────────────────────────────────────────────────────────────
import { X, Trash2 } from 'lucide-react'
import CropSelector from './cropSelector'
import { getCropById } from '../data/cropLibrary'

type Props = {
  plant: { id: string; cropTypeId: string }
  onChangeCrop: (cropTypeId: string) => void
  onDelete: () => void
  onClose: () => void
}

export default function PlantEditPanel({ plant, onChangeCrop, onDelete, onClose }: Props) {
  const crop = getCropById(plant.cropTypeId)

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
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Cultivo</label>
          <CropSelector
            value={plant.cropTypeId}
            onChange={(id) => { if (id) onChangeCrop(id) }}
            placeholder="Seleccionar cultivo"
          />
        </div>

        <button onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#9aab8a] border border-[#e0e8d8] rounded-lg hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={13} /> Eliminar planta
        </button>
      </div>
    </div>
  )
}
