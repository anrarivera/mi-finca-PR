import { useMemo, useState } from 'react'
import { localCategory, localName } from '@/i18n'
import { useTranslation } from 'react-i18next'
import { X, Sprout } from 'lucide-react'
import { useCropStore } from '@/store/useCropStore'
import { toast } from '@/store/useToastStore'
import { CROP_LIBRARY } from '../data/cropLibrary'
import { useCreateCrop } from '../hooks/useCropsApi'
import { useCreateRecipe, useSetRecipeDefault } from '../hooks/useRecipesApi'
import RecipeScheduleForm, {
  emptyScheduleDraft, validateScheduleDraft, type ScheduleDraft,
} from './recipeScheduleForm'

// ──────────────────────────────────────────────────────────────────────────
// Create a custom crop — IDENTITY (name/emoji/category) via the crops API,
// with an optional first recipe that becomes the author's personal
// default so planting it stamps a calendar. Crop ids become shared
// vocabulary once recipes are comparable, so the name search nudges hard
// toward reusing an existing crop before minting a duplicate.
// ──────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Musáceas', 'Cítricos', 'Frutas Tropicales', 'Viandas',
  'Árboles', 'Vegetales', 'Compañeras', 'Personalizados',
]

type Props = {
  onClose: () => void
  onCreated: (cropId: string) => void
}

export default function CustomCropModal({ onClose, onCreated }: Props) {
  const { t } = useTranslation('editor')
  const storeCrops = useCropStore(s => s.crops)
  const createCrop = useCreateCrop()
  const createRecipe = useCreateRecipe()
  const setDefault = useSetRecipeDefault()

  const [nameEs, setNameEs] = useState('')
  const [emoji, setEmoji] = useState('🌱')
  const [category, setCategory] = useState('Personalizados')
  const [withRecipe, setWithRecipe] = useState(false)
  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    emptyScheduleDraft(t('customCrop.defaultOpLabel'))
  )

  // Dedup nudge: as the farmer types, surface existing crops so a second
  // "Guanábana" reuses the first — fragmented ids poison comparison.
  const knownCrops = storeCrops.length > 0 ? storeCrops : CROP_LIBRARY
  const similar = useMemo(() => {
    const q = nameEs.trim().toLowerCase()
    if (q.length < 2) return []
    return knownCrops
      .filter(c =>
        c.nameEs.toLowerCase().includes(q) ||
        (c.name ?? '').toLowerCase().includes(q)
      )
      .slice(0, 4)
  }, [knownCrops, nameEs])

  const saving = createCrop.isPending || createRecipe.isPending || setDefault.isPending

  async function handleSave() {
    const trimmed = nameEs.trim()
    if (!trimmed) {
      toast.error(t('customCrop.needsName'))
      return
    }
    let schedule = null
    if (withRecipe) {
      const result = validateScheduleDraft(draft, t)
      if ('error' in result) { toast.error(result.error); return }
      schedule = result.schedule
    }

    try {
      const crop = await createCrop.mutateAsync({
        nameEs: trimmed,
        emoji: emoji.trim() || '🌱',
        category: category.trim() || 'Personalizados',
      })
      if (schedule) {
        const recipe = await createRecipe.mutateAsync({
          cropTypeId: crop.id,
          name: t('recipes.defaultName', { crop: trimmed }),
          schedule,
        })
        // Without a personal default the new recipe would never stamp.
        await setDefault.mutateAsync({ cropTypeId: crop.id, recipeId: recipe.id, scope: 'user' })
      }
      toast.success(t('customCrop.created', { name: trimmed }))
      onCreated(crop.id)
    } catch {
      // The api client toasts server errors; keep the modal open so the
      // farmer's input survives.
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[1300] bg-black/40 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg max-h-[85dvh] overflow-y-auto bg-white rounded-2xl shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e8d8] sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Sprout size={16} className="text-[#4d7a1b]" />
            <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('customCrop.title')}</h2>
          </div>
          <button onClick={onClose} aria-label={t('customCrop.close')} className="text-[#66755a] hover:text-[#2d4a1e] transition-colors">
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
                // Initial focus inside a just-opened dialog IS correct focus
                // management (the rule targets page-load autofocus).
                // eslint-disable-next-line jsx-a11y/no-autofocus
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

          {/* Dedup nudge */}
          {similar.length > 0 && (
            <div className="flex flex-col gap-1.5 p-3 bg-[#fffbeb] border border-amber-200 rounded-xl">
              <p className="text-[11px] font-medium text-amber-800">{t('customCrop.similarTitle')}</p>
              <div className="flex flex-wrap gap-1.5">
                {similar.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onCreated(c.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-[#2d4a1e] bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                  >
                    <span>{c.emoji}</span> {localName(c)}
                    <span className="text-[#66755a]">· {t('customCrop.useExisting')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[#5a6a4a]">{t('customCrop.category')}</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="px-3 py-2 text-sm text-[#2d4a1e] bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{localCategory(c)}</option>)}
            </select>
          </label>

          {/* Recipe toggle */}
          <label className="flex items-center gap-2.5 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={withRecipe}
              onChange={e => setWithRecipe(e.target.checked)}
              // The visible text sits two levels deep (div > p) — name the
              // control directly so screen readers announce it.
              aria-label={t('customCrop.addRecipe')}
              className="accent-[#639922] w-4 h-4 pointer-coarse:w-5 pointer-coarse:h-5"
            />
            <div>
              <p className="text-xs font-medium text-[#2d4a1e]">{t('customCrop.addRecipe')}</p>
              <p className="text-[10px] text-[#66755a]">
                {t('customCrop.recipeHint')}
              </p>
            </div>
          </label>

          {withRecipe && <RecipeScheduleForm draft={draft} onChange={setDraft} />}
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
            disabled={saving}
            className="px-4 py-2 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-50"
          >
            {t('customCrop.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
