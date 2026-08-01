import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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

// Display labels live in the i18n dictionaries under editor:customCrop.opTypes.<value>.
const OP_TYPES: RecommendedOperationType[] = [
  'fertilization', 'spray', 'cultivation', 'irrigation', 'monitoring', 'harvest',
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
  const { t } = useTranslation('editor')
  const addCustomCrop = useCropStore(s => s.addCustomCrop)

  const [nameEs, setNameEs] = useState('')
  const [emoji, setEmoji] = useState('🌱')
  const [category, setCategory] = useState('Personalizados')
  const [withRecipe, setWithRecipe] = useState(false)
  const [windowStart, setWindowStart] = useState('90')
  const [windowEnd, setWindowEnd] = useState('120')
  const [ops, setOps] = useState<OpDraft[]>(() => [
    { type: 'fertilization', labelEs: t('customCrop.defaultOpLabel'), offsetDays: '14' },
  ])

  function updateOp(index: number, patch: Partial<OpDraft>) {
    setOps(prev => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  }

  function handleSave() {
    const trimmed = nameEs.trim()
    if (!trimmed) {
      toast.error(t('customCrop.needsName'))
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
        toast.error(t('customCrop.badWindow'))
        return
      }
      const templates: RecommendedOperationTemplate[] = []
      for (const [i, draft] of ops.entries()) {
        const label = draft.labelEs.trim()
        const offset = Math.round(Number(draft.offsetDays))
        if (!label) {
          toast.error(t('customCrop.opNeedsDescription', { number: i + 1 }))
          return
        }
        if (!Number.isFinite(offset) || offset < 0) {
          toast.error(t('customCrop.opNeedsDays', { number: i + 1 }))
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
    toast.success(t('customCrop.created', { name: trimmed }))
    onCreated(cropId)
  }

  return (
    <div
      className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg max-h-[85dvh] overflow-y-auto bg-white rounded-2xl shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e8d8] sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Sprout size={16} className="text-[#639922]" />
            <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('customCrop.title')}</h2>
          </div>
          <button onClick={onClose} aria-label={t('customCrop.close')} className="text-[#9aab8a] hover:text-[#2d4a1e] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Basic info */}
          <div className="grid grid-cols-[1fr_72px] gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#5a6a4a]">{t('customCrop.name')}</span>
              <input
                value={nameEs}
                onChange={e => setNameEs(e.target.value)}
                placeholder={t('customCrop.namePlaceholder')}
                autoFocus
                className="px-3 py-2 text-sm text-[#2d4a1e] border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#5a6a4a]">{t('customCrop.emoji')}</span>
              <input
                value={emoji}
                onChange={e => setEmoji(e.target.value)}
                maxLength={4}
                className="px-3 py-2 text-sm text-center border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[#5a6a4a]">{t('customCrop.category')}</span>
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
              className="accent-[#639922] w-4 h-4 pointer-coarse:w-5 pointer-coarse:h-5"
            />
            <div>
              <p className="text-xs font-medium text-[#2d4a1e]">{t('customCrop.addRecipe')}</p>
              <p className="text-[10px] text-[#9aab8a]">
                {t('customCrop.recipeHint')}
              </p>
            </div>
          </label>

          {withRecipe && (
            <div className="flex flex-col gap-3 p-3 bg-[#fafcf8] border border-[#e0e8d8] rounded-xl">

              {/* Harvest window */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#5a6a4a]">{t('customCrop.harvestFrom')}</span>
                  <input
                    type="number" min={0} value={windowStart}
                    onChange={e => setWindowStart(e.target.value)}
                    className="px-3 py-2 text-sm border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#5a6a4a]">{t('customCrop.harvestTo')}</span>
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
                  {t('customCrop.opsLabel')}
                </span>
                {ops.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={o.type}
                      onChange={e => updateOp(i, { type: e.target.value as RecommendedOperationType })}
                      className="px-2 py-1.5 text-xs bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922] shrink-0"
                    >
                      {OP_TYPES.map(v => <option key={v} value={v}>{t(`customCrop.opTypes.${v}`)}</option>)}
                    </select>
                    <input
                      value={o.labelEs}
                      onChange={e => updateOp(i, { labelEs: e.target.value })}
                      placeholder={t('customCrop.descriptionPlaceholder')}
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
                    />
                    <input
                      type="number" min={0} value={o.offsetDays}
                      onChange={e => updateOp(i, { offsetDays: e.target.value })}
                      title={t('customCrop.daysAfterPlanting')}
                      className="w-16 px-2 py-1.5 text-xs text-center border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922] shrink-0"
                    />
                    <button
                      onClick={() => setOps(prev => prev.filter((_, j) => j !== i))}
                      aria-label={t('customCrop.deleteOp')}
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
                  <Plus size={11} /> {t('customCrop.addOp')}
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
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
          >
            {t('customCrop.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
