import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/store/useToastStore'
import { localOpLabel } from '@/i18n'
import { useUpdateRecipeSchedule, type ApiRecipe } from '../hooks/useRecipesApi'

// ──────────────────────────────────────────────────────────────────────────
// A recipe's operations, expanded in place in the Recetas tab. Own
// recipes get editable day-offsets — quick tailoring without opening the
// full editor (which stays the place for adding/removing/renaming ops).
// R1 still applies server-side: saving over a referenced version mints
// the next number, and the hint below says so before the farmer commits.
// ──────────────────────────────────────────────────────────────────────────

export default function RecipeOpsPanel({ recipe, editable }: {
  recipe: ApiRecipe
  editable: boolean
}) {
  const { t } = useTranslation('editor')
  const updateSchedule = useUpdateRecipeSchedule()
  const version = recipe.currentVersion

  // Sorted once by the SAVED offsets so rows don't jump while typing.
  const [ops] = useState(() =>
    [...(version?.operations ?? [])].sort((a, b) => a.offsetDays - b.offsetDays)
  )
  const [offsets, setOffsets] = useState<Record<string, string>>(() =>
    Object.fromEntries((version?.operations ?? []).map(o => [o.id, String(o.offsetDays)]))
  )

  if (!version) return null

  const dirty = version.operations.some(o => offsets[o.id] !== String(o.offsetDays))

  async function handleSave() {
    if (!version) return
    for (const op of version.operations) {
      const n = Math.round(Number(offsets[op.id]))
      if (!Number.isFinite(n) || n < 0) {
        toast.error(t('customCrop.opNeedsDays', { number: 1 }))
        return
      }
    }
    try {
      const updated = await updateSchedule.mutateAsync({
        id: recipe.id,
        schedule: {
          harvestWindowStartDays: version.harvestWindowStartDays,
          harvestWindowEndDays: version.harvestWindowEndDays,
          operations: version.operations.map(o => ({
            id: o.id,
            type: o.type,
            label: o.label,
            labelEs: o.labelEs,
            notes: o.notes,
            notesEs: o.notesEs,
            product: o.product,
            offsetDays: Math.round(Number(offsets[o.id])),
          })),
        },
      })
      toast.success(t('recipes.saved', {
        name: recipe.name,
        version: updated.currentVersion?.number ?? version.number,
      }))
    } catch { /* api client toasts */ }
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3 bg-[#fafcf8] border-t border-[#f0f5e8]">
      {ops.length === 0 ? (
        <p className="text-[11px] text-[#66755a]">{t('recipes.noOps')}</p>
      ) : (
        ops.map(op => (
          <div key={op.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#f0f5e8] text-[#5a6a4a] shrink-0">
              {t(`customCrop.opTypes.${op.type}`, op.type)}
            </span>
            <span className="flex-1 min-w-40 text-[11px] text-[#2d4a1e]">
              {localOpLabel(op.labelEs)}
              {op.product && <span className="text-[#66755a]"> · {op.product}</span>}
            </span>
            {editable ? (
              <label className="flex items-center gap-1 text-[10px] text-[#66755a]">
                <input
                  type="number" min={0}
                  value={offsets[op.id] ?? ''}
                  onChange={e => setOffsets(prev => ({ ...prev, [op.id]: e.target.value }))}
                  aria-label={t('customCrop.daysAfterPlanting')}
                  className="w-16 px-2 py-1 text-[11px] text-center border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922] bg-white"
                />
                {t('recipes.daysSuffix')}
              </label>
            ) : (
              <span className="text-[11px] text-[#66755a] tabular-nums">
                {t('recipes.dayN', { count: op.offsetDays })}
              </span>
            )}
          </div>
        ))
      )}

      {editable && dirty && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {version.referenced && (
            <p className="w-full text-[10px] text-amber-700">
              {t('recipes.referencedHint', { version: version.number + 1 })}
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={updateSchedule.isPending}
            className="px-3 py-1.5 text-[11px] bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-50"
          >
            {t('recipes.save')}
          </button>
          <button
            onClick={() => setOffsets(Object.fromEntries(version.operations.map(o => [o.id, String(o.offsetDays)])))}
            className="px-3 py-1.5 text-[11px] text-[#5a6a4a] border border-[#e0e8d8] rounded-lg hover:bg-[#f5f8f0] transition-colors"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
