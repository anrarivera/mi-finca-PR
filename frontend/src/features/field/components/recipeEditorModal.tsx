import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, NotebookPen } from 'lucide-react'
import { toast } from '@/store/useToastStore'
import { localName } from '@/i18n'
import { getCropById } from '../data/cropLibrary'
import CropSelector from './cropSelector'
import RecipeScheduleForm, {
  emptyScheduleDraft, draftFromVersion, validateScheduleDraft, type ScheduleDraft,
} from './recipeScheduleForm'
import {
  useCreateRecipe, useUpdateRecipe, useUpdateRecipeSchedule, useSetRecipeDefault,
  type ApiRecipe,
} from '../hooks/useRecipesApi'

// ──────────────────────────────────────────────────────────────────────────
// Author or edit a recipe ("mi calendario para <crop>"). Editing an
// already-planted (referenced) version mints the next version server-side
// (R1) — the hint tells the farmer their evidence stays frozen. Creating
// can set the recipe as the author's personal default so it actually
// stamps at planting.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  /** Preselects the crop; omit to let the farmer pick one. */
  cropTypeId?: string
  /** Edit an existing recipe (own only); omit to create. */
  recipe?: ApiRecipe | null
  onClose: () => void
}

export default function RecipeEditorModal({ cropTypeId, recipe, onClose }: Props) {
  const { t } = useTranslation('editor')
  const createRecipe = useCreateRecipe()
  const updateRecipe = useUpdateRecipe()
  const updateSchedule = useUpdateRecipeSchedule()
  const setDefault = useSetRecipeDefault()

  const editing = recipe ?? null
  const [selectedCropId, setSelectedCropId] = useState<string | null>(
    editing?.cropTypeId ?? cropTypeId ?? null
  )
  const crop = selectedCropId ? getCropById(selectedCropId) : null

  const [name, setName] = useState(() =>
    editing?.name ??
    (crop ? t('recipes.defaultName', { crop: localName(crop) }) : '')
  )
  const [nameTouched, setNameTouched] = useState(!!editing)
  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    editing?.currentVersion
      ? draftFromVersion(editing.currentVersion)
      : emptyScheduleDraft(t('customCrop.defaultOpLabel'))
  )
  const [note, setNote] = useState('')
  const [makeDefault, setMakeDefault] = useState(!editing)

  const referenced = editing?.currentVersion?.referenced ?? false
  const saving = createRecipe.isPending || updateRecipe.isPending ||
    updateSchedule.isPending || setDefault.isPending

  function pickCrop(id: string) {
    setSelectedCropId(id)
    if (!nameTouched) {
      const picked = getCropById(id)
      if (picked) setName(t('recipes.defaultName', { crop: localName(picked) }))
    }
  }

  async function handleSave() {
    const trimmedName = name.trim()
    if (!selectedCropId) { toast.error(t('recipes.needsCrop')); return }
    if (!trimmedName) { toast.error(t('recipes.needsName')); return }
    const result = validateScheduleDraft(draft, t)
    if ('error' in result) { toast.error(result.error); return }

    try {
      if (editing) {
        if (trimmedName !== editing.name) {
          await updateRecipe.mutateAsync({ id: editing.id, name: trimmedName })
        }
        const updated = await updateSchedule.mutateAsync({
          id: editing.id,
          schedule: result.schedule,
          note: referenced ? (note.trim() || null) : null,
        })
        toast.success(t('recipes.saved', { name: trimmedName, version: updated.currentVersion?.number ?? 1 }))
      } else {
        const created = await createRecipe.mutateAsync({
          cropTypeId: selectedCropId,
          name: trimmedName,
          schedule: result.schedule,
        })
        if (makeDefault) {
          await setDefault.mutateAsync({
            cropTypeId: selectedCropId, recipeId: created.id, scope: 'user',
          })
        }
        toast.success(t('recipes.created', { name: trimmedName }))
      }
      onClose()
    } catch {
      // The api client already toasts server errors; keep the modal open
      // so nothing typed is lost.
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e8d8] sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <NotebookPen size={16} className="text-[#4d7a1b]" />
            <h2 className="text-sm font-semibold text-[#2d4a1e]">
              {editing
                ? t('recipes.editTitle', { name: editing.name })
                : crop
                  ? t('recipes.titleFor', { crop: localName(crop) })
                  : t('recipes.title')}
            </h2>
          </div>
          <button onClick={onClose} aria-label={t('customCrop.close')} className="text-[#66755a] hover:text-[#2d4a1e] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Crop (create mode without a preset only) */}
          {!editing && !cropTypeId && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#5a6a4a]">{t('recipes.cropLabel')}</span>
              <CropSelector value={selectedCropId} onChange={pickCrop} />
            </div>
          )}

          {/* Name */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[#5a6a4a]">{t('recipes.nameLabel')}</span>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setNameTouched(true) }}
              placeholder={t('recipes.namePlaceholder')}
              className="px-3 py-2 text-sm text-[#2d4a1e] border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            />
          </label>

          <RecipeScheduleForm draft={draft} onChange={setDraft} />

          {/* R1: this version has evidence — the save mints the next one. */}
          {referenced && (
            <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-[11px] text-amber-800">
                {t('recipes.referencedHint', { version: (editing?.currentVersion?.number ?? 1) + 1 })}
              </p>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t('recipes.notePlaceholder')}
                className="px-3 py-2 text-xs border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400 bg-white"
              />
            </div>
          )}

          {!editing && (
            <label className="flex items-center gap-2.5 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={e => setMakeDefault(e.target.checked)}
                className="accent-[#639922] w-4 h-4 pointer-coarse:w-5 pointer-coarse:h-5"
              />
              <span className="text-xs text-[#2d4a1e]">{t('recipes.makeDefault')}</span>
            </label>
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
            disabled={saving}
            className="px-4 py-2 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-50"
          >
            {editing ? t('recipes.save') : t('recipes.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
