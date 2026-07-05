import { useState } from 'react'
import { X, Plus, Trash2, Sprout } from 'lucide-react'
import { useCropStore } from '@/store/useCropStore'
import { toast } from '@/store/useToastStore'
import type { CropType } from '../data/cropLibrary'
import type {
  CropSchedule, RecommendedOperationTemplate, RecommendedOperationType,
} from '../data/cropSchedules'

// ──────────────────────────────────────────────────────────────────────────
// Create a custom crop with an optional operations recipe (issue #1).
// The crop becomes selectable everywhere built-ins are; if a recipe is
// defined, planting it generates the same operations calendar built-in
// schedules do.
// ──────────────────────────────────────────────────────────────────────────

const OP_TYPES: Array<{ value: RecommendedOperationType; labelEs: string }> = [
  { value: 'fertilization', labelEs: 'Fertilización' },
  { value: 'spray', labelEs: 'Fumigación' },
  { value: 'cultivation', labelEs: 'Cultivación' },
  { value: 'irrigation', labelEs: 'Riego' },
  { value: 'monitoring', labelEs: 'Monitoreo' },
  { value: 'harvest', labelEs: 'Cosecha' },
]

const CATEGORIES = [
  'Musáceas', 'Cítricos', 'Frutas Tropicales', 'Viandas',
  'Árboles', 'Vegetales', 'Compañeras', 'Personalizados',
]

type OpDraft = { type: RecommendedOperationType; labelEs: string; offsetDays: string }

type Props = {
  onClose: () => void
  onCreated: (cropId: string) => void
}

export default function CustomCropModal({ onClose, onCreated }: Props) {
  const addCustomCrop = useCropStore(s => s.addCustomCrop)

  const [nameEs, setNameEs] = useState('')
  const [emoji, setEmoji] = useState('🌱')
  const [category, setCategory] = useState('Personalizados')
  const [withRecipe, setWithRecipe] = useState(false)
  const [windowStart, setWindowStart] = useState('90')
  const [windowEnd, setWindowEnd] = useState('120')
  const [ops, setOps] = useState<OpDraft[]>([
    { type: 'fertilization', labelEs: 'Primera fertilización', offsetDays: '14' },
  ])

  function updateOp(index: number, patch: Partial<OpDraft>) {
    setOps(prev => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  }

  function handleSave() {
    const trimmed = nameEs.trim()
    if (!trimmed) {
      toast.error('El cultivo necesita un nombre.')
      return
    }

    const cropId = `custom-${crypto.randomUUID()}`
    const crop: CropType = {
      id: cropId,
      name: trimmed,
      nameEs: trimmed,
      emoji: emoji.trim() || '🌱',
      category: category.trim() || 'Personalizados',
    }

    let schedule: CropSchedule | null = null
    if (withRecipe) {
      const start = Math.round(Number(windowStart))
      const end = Math.round(Number(windowEnd))
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
        toast.error('Revisa la ventana de cosecha: el fin debe ser igual o mayor que el inicio.')
        return
      }
      const templates: RecommendedOperationTemplate[] = []
      for (const [i, draft] of ops.entries()) {
        const label = draft.labelEs.trim()
        const offset = Math.round(Number(draft.offsetDays))
        if (!label) {
          toast.error(`La operación #${i + 1} necesita una descripción.`)
          return
        }
        if (!Number.isFinite(offset) || offset < 0) {
          toast.error(`La operación #${i + 1} necesita días desde siembra (0 o más).`)
          return
        }
        templates.push({
          id: `${cropId}-op-${i}`,
          type: draft.type,
          label,
          labelEs: label,
          offsetDays: offset,
        })
      }
      schedule = {
        cropTypeId: cropId,
        harvestWindowStartDays: start,
        harvestWindowEndDays: end,
        operations: templates,
      }
    }

    addCustomCrop({ crop, schedule })
    toast.success(`Cultivo "${trimmed}" creado`)
    onCreated(cropId)
  }

  return (
    <div
      className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e8d8] sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Sprout size={16} className="text-[#639922]" />
            <h2 className="text-sm font-semibold text-[#2d4a1e]">Nuevo cultivo personalizado</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-[#9aab8a] hover:text-[#2d4a1e] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Basic info */}
          <div className="grid grid-cols-[1fr_72px] gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#5a6a4a]">Nombre *</span>
              <input
                value={nameEs}
                onChange={e => setNameEs(e.target.value)}
                placeholder="p. ej. Acerola"
                autoFocus
                className="px-3 py-2 text-sm text-[#2d4a1e] border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#5a6a4a]">Emoji</span>
              <input
                value={emoji}
                onChange={e => setEmoji(e.target.value)}
                maxLength={4}
                className="px-3 py-2 text-sm text-center border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[#5a6a4a]">Categoría</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="px-3 py-2 text-sm text-[#2d4a1e] bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          {/* Recipe toggle */}
          <label className="flex items-center gap-2.5 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={withRecipe}
              onChange={e => setWithRecipe(e.target.checked)}
              className="accent-[#639922] w-4 h-4"
            />
            <div>
              <p className="text-xs font-medium text-[#2d4a1e]">Añadir receta de operaciones</p>
              <p className="text-[10px] text-[#9aab8a]">
                Genera automáticamente el calendario de labores al sembrar este cultivo.
              </p>
            </div>
          </label>

          {withRecipe && (
            <div className="flex flex-col gap-3 p-3 bg-[#fafcf8] border border-[#e0e8d8] rounded-xl">

              {/* Harvest window */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#5a6a4a]">Cosecha desde (días)</span>
                  <input
                    type="number" min={0} value={windowStart}
                    onChange={e => setWindowStart(e.target.value)}
                    className="px-3 py-2 text-sm border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#5a6a4a]">Cosecha hasta (días)</span>
                  <input
                    type="number" min={0} value={windowEnd}
                    onChange={e => setWindowEnd(e.target.value)}
                    className="px-3 py-2 text-sm border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
                  />
                </label>
              </div>

              {/* Operation templates */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium text-[#5a6a4a]">
                  Operaciones (días después de la siembra)
                </span>
                {ops.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={o.type}
                      onChange={e => updateOp(i, { type: e.target.value as RecommendedOperationType })}
                      className="px-2 py-1.5 text-xs bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922] shrink-0"
                    >
                      {OP_TYPES.map(t => <option key={t.value} value={t.value}>{t.labelEs}</option>)}
                    </select>
                    <input
                      value={o.labelEs}
                      onChange={e => updateOp(i, { labelEs: e.target.value })}
                      placeholder="Descripción"
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
                    />
                    <input
                      type="number" min={0} value={o.offsetDays}
                      onChange={e => updateOp(i, { offsetDays: e.target.value })}
                      title="Días después de la siembra"
                      className="w-16 px-2 py-1.5 text-xs text-center border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922] shrink-0"
                    />
                    <button
                      onClick={() => setOps(prev => prev.filter((_, j) => j !== i))}
                      aria-label="Eliminar operación"
                      className="text-[#9aab8a] hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setOps(prev => [...prev, { type: 'monitoring', labelEs: '', offsetDays: '30' }])}
                  className="flex items-center gap-1.5 self-start px-2.5 py-1.5 text-[11px] text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
                >
                  <Plus size={11} /> Añadir operación
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#e0e8d8]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-[#5a6a4a] border border-[#e0e8d8] rounded-lg hover:bg-[#f5f8f0] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
          >
            Crear cultivo
          </button>
        </div>
      </div>
    </div>
  )
}
