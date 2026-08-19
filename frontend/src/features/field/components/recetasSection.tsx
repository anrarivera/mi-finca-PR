import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Star, Tractor, Pencil, Trash2, BarChart3, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { useFarmStore, canManageStructure } from '@/store/useFarmStore'
import { toast } from '@/store/useToastStore'
import { localName, localOpLabel } from '@/i18n'
import { downloadCsv } from '@/lib/csv'
import { useConfirm } from '@/components/shared/confirmDialog'
import { getCropById } from '../data/cropLibrary'
import {
  useRecipes, useRecipeDefaults, useSetRecipeDefault, useDeleteRecipe,
  type ApiRecipe,
} from '../hooks/useRecipesApi'
import RecipeEditorModal from './recipeEditorModal'
import RecipeEvidencePanel from './recipeEvidencePanel'
import RecipeOpsPanel from './recipeOpsPanel'

// ──────────────────────────────────────────────────────────────────────────
// Cuaderno → Recetas: the farmer's cookbook. System recipes plus their
// own, grouped by crop, with the two default pointers the R2 ladder
// reads: "mi predeterminada" (personal — travels with the farmer) and
// "se usa en esta finca" (farm — owner/admin only, what the crew plants
// by). Editing a planted recipe mints the next version; evidence stays
// frozen on the old one.
// ──────────────────────────────────────────────────────────────────────────

export default function RecetasSection() {
  const { t } = useTranslation('editor')
  const activeFarm = useFarmStore(s => s.activeFarm)
  const { data: recipes = [], isLoading } = useRecipes()
  const { data: defaults } = useRecipeDefaults(activeFarm?.id ?? null)
  const setDefault = useSetRecipeDefault()
  const deleteRecipe = useDeleteRecipe()
  const { confirm, confirmDialog } = useConfirm()

  const [editor, setEditor] = useState<null | { cropTypeId?: string; recipe?: ApiRecipe }>(null)
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)

  const personalByCrop = useMemo(
    () => new Map((defaults?.personal ?? []).map(d => [d.cropTypeId, d.recipeId])),
    [defaults]
  )
  const farmByCrop = useMemo(
    () => new Map((defaults?.farm ?? []).filter(d => !d.fieldId).map(d => [d.cropTypeId, d.recipeId])),
    [defaults]
  )
  const canSetFarmDefault = !!activeFarm && canManageStructure(activeFarm)

  const byCrop = useMemo(() => {
    const groups = new Map<string, ApiRecipe[]>()
    for (const r of recipes) {
      const list = groups.get(r.cropTypeId) ?? []
      list.push(r)
      groups.set(r.cropTypeId, list)
    }
    return [...groups.entries()]
      .map(([cropTypeId, list]) => ({
        cropTypeId,
        crop: getCropById(cropTypeId),
        // Own recipes first, then system; stable by name inside each.
        recipes: list.sort((a, b) =>
          (a.authorUserId === null ? 1 : 0) - (b.authorUserId === null ? 1 : 0) ||
          a.name.localeCompare(b.name)
        ),
      }))
      .sort((a, b) =>
        localName(a.crop, a.cropTypeId).localeCompare(localName(b.crop, b.cropTypeId))
      )
  }, [recipes])

  async function toggleDefault(recipe: ApiRecipe, scope: 'user' | 'farm', isActive: boolean) {
    try {
      await setDefault.mutateAsync({
        cropTypeId: recipe.cropTypeId,
        recipeId: isActive ? null : recipe.id,
        scope,
        ...(scope === 'farm' ? { farmId: activeFarm!.id } : {}),
      })
      toast.success(isActive ? t('recipes.defaultCleared') : t('recipes.defaultSet', { name: recipe.name }))
    } catch { /* api client toasts */ }
  }

  // The recipe as a file the farmer owns — one flat row per operation,
  // Excel-friendly (CSV export free forever is the product promise).
  function downloadRecipe(recipe: ApiRecipe) {
    const v = recipe.currentVersion
    if (!v) return
    const crop = getCropById(recipe.cropTypeId)
    const cropName = localName(crop, recipe.cropTypeId)
    const slug = recipe.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    downloadCsv(
      `mi-finca-receta-${slug || 'receta'}-v${v.number}.csv`,
      [
        t('recipes.csv.recipe'), t('recipes.csv.crop'), t('recipes.csv.version'),
        t('recipes.csv.operation'), t('recipes.csv.type'), t('recipes.csv.days'),
        t('recipes.csv.product'), t('recipes.csv.harvestFrom'), t('recipes.csv.harvestTo'),
      ],
      [...v.operations]
        .sort((a, b) => a.offsetDays - b.offsetDays)
        .map(op => [
          recipe.name, cropName, `v${v.number}`,
          localOpLabel(op.labelEs), t(`customCrop.opTypes.${op.type}`, op.type), op.offsetDays,
          op.product ?? '', v.harvestWindowStartDays, v.harvestWindowEndDays,
        ])
    )
  }

  async function handleDelete(recipe: ApiRecipe) {
    const ok = await confirm({
      title: t('recipes.deleteTitle', { name: recipe.name }),
      message: t('recipes.deleteMessage'),
      danger: true,
    })
    if (!ok) return
    try {
      const res = await deleteRecipe.mutateAsync(recipe.id)
      toast.success(
        (res as { archived?: boolean }).archived
          ? t('recipes.archivedToast', { name: recipe.name })
          : t('recipes.deletedToast', { name: recipe.name })
      )
    } catch { /* api client toasts */ }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar — one button: the editor's crop picker covers "new crop"
          via its footer, so a separate button was redundant. */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-[#66755a] flex-1 min-w-48">{t('recipes.sectionHint')}</p>
        <button
          onClick={() => setEditor({})}
          className="flex items-center gap-1.5 px-3 py-2 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
        >
          <Plus size={13} /> {t('recipes.newRecipe')}
        </button>
      </div>

      {isLoading ? null : byCrop.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e0e8d8] px-6 py-12 text-center">
          <p className="text-4xl mb-3">📓</p>
          <p className="text-sm text-[#66755a]">{t('recipes.empty')}</p>
        </div>
      ) : (
        byCrop.map(group => (
          <section key={group.cropTypeId} className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#f0f5e8] bg-[#fafcf8]">
              <span className="text-base">{group.crop?.emoji ?? '🌱'}</span>
              <h3 className="flex-1 text-sm font-semibold text-[#2d4a1e]">
                {localName(group.crop, group.cropTypeId)}
              </h3>
              <button
                onClick={() => setEditor({ cropTypeId: group.cropTypeId })}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#4d7a1b] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
              >
                <Plus size={11} /> {t('recipes.newForCrop')}
              </button>
            </div>

            <div className="divide-y divide-[#f0f5e8]">
              {group.recipes.map(recipe => {
                const isSystem = recipe.authorUserId === null
                const isMyDefault = personalByCrop.get(recipe.cropTypeId) === recipe.id
                const isFarmDefault = farmByCrop.get(recipe.cropTypeId) === recipe.id
                const showEvidence = evidenceFor === recipe.id
                const showDetail = detailFor === recipe.id
                const v = recipe.currentVersion
                return (
                  <div key={recipe.id}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                    <button
                      onClick={() => setDetailFor(prev => (prev === recipe.id ? null : recipe.id))}
                      className="flex-1 min-w-48 text-left"
                      aria-expanded={showDetail}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {showDetail
                          ? <ChevronDown size={13} className="text-[#66755a] shrink-0" />
                          : <ChevronRight size={13} className="text-[#66755a] shrink-0" />}
                        <span className="text-sm font-medium text-[#2d4a1e]">{recipe.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#f0f5e8] text-[#5a6a4a]">
                          {isSystem ? t('recipes.systemChip') : `v${v?.number ?? 1}`}
                        </span>
                        {isMyDefault && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#eaf3de] text-[#3f6414]">
                            <Star size={9} /> {t('recipes.myDefaultChip')}
                          </span>
                        )}
                        {isFarmDefault && activeFarm && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#e8f0f7] text-[#2c5c8a]">
                            <Tractor size={9} /> {t('recipes.farmDefaultChip', { farm: activeFarm.name })}
                          </span>
                        )}
                      </div>
                      {v && (
                        <p className="text-[11px] text-[#66755a] mt-0.5 pl-[18px]">
                          {t('recipes.windowSummary', { start: v.harvestWindowStartDays, end: v.harvestWindowEndDays })}
                          {' · '}
                          {t('recipes.opsCount', { count: v.operations.length })}
                        </p>
                      )}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => downloadRecipe(recipe)}
                        title={t('recipes.download')}
                        className="p-1.5 rounded-lg border border-[#e0e8d8] text-[#66755a] hover:bg-[#f5f8f0] transition-colors"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={() => setEvidenceFor(prev => (prev === recipe.id ? null : recipe.id))}
                        title={t('recipes.evidenceToggle')}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          showEvidence
                            ? 'text-[#3f6414] border-[#c8dca8] bg-[#eaf3de]'
                            : 'text-[#66755a] border-[#e0e8d8] hover:bg-[#f5f8f0]'
                        }`}
                      >
                        <BarChart3 size={13} />
                      </button>
                      <button
                        onClick={() => toggleDefault(recipe, 'user', isMyDefault)}
                        title={isMyDefault ? t('recipes.clearMyDefault') : t('recipes.setMyDefault')}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isMyDefault
                            ? 'text-[#3f6414] border-[#c8dca8] bg-[#eaf3de]'
                            : 'text-[#66755a] border-[#e0e8d8] hover:bg-[#f5f8f0]'
                        }`}
                      >
                        <Star size={13} fill={isMyDefault ? 'currentColor' : 'none'} />
                      </button>
                      {canSetFarmDefault && (
                        <button
                          onClick={() => toggleDefault(recipe, 'farm', isFarmDefault)}
                          title={isFarmDefault ? t('recipes.clearFarmDefault') : t('recipes.setFarmDefault', { farm: activeFarm!.name })}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            isFarmDefault
                              ? 'text-[#2c5c8a] border-[#c3d8ea] bg-[#e8f0f7]'
                              : 'text-[#66755a] border-[#e0e8d8] hover:bg-[#f5f8f0]'
                          }`}
                        >
                          <Tractor size={13} />
                        </button>
                      )}
                      {!isSystem && (
                        <>
                          <button
                            onClick={() => setEditor({ recipe })}
                            title={t('recipes.edit')}
                            className="p-1.5 rounded-lg border border-[#e0e8d8] text-[#66755a] hover:bg-[#f5f8f0] transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(recipe)}
                            title={t('recipes.delete')}
                            className="p-1.5 rounded-lg border border-[#e0e8d8] text-[#66755a] hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {showDetail && (
                    <RecipeOpsPanel
                      // Keyed by version so a save (which may mint the next
                      // version) resets the panel's local offsets.
                      key={v?.id ?? 'no-version'}
                      recipe={recipe}
                      editable={!isSystem}
                    />
                  )}
                  {showEvidence && <RecipeEvidencePanel recipeId={recipe.id} />}
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}

      {editor && (
        <RecipeEditorModal
          cropTypeId={editor.cropTypeId}
          recipe={editor.recipe}
          onClose={() => setEditor(null)}
        />
      )}
      {confirmDialog}
    </div>
  )
}
