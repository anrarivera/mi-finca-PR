import { prisma } from './prisma'
import { enforceContract } from '../contracts/enforce'
import {
  recipeResponseSchema, resolvedRecipeEntrySchema, ResolvedRecipeEntry,
} from '../contracts/recipeContract'

// ── Recipe helpers: serialization, the R2 ladder, reference stamping ────

type RecipeWithVersions = any // prisma recipe row with versions[] included

// Recipes always load with their newest version first:
//   include: { versions: currentVersionInclude }
export const currentVersionInclude = {
  orderBy: { number: 'desc' as const },
  take: 1,
}

export function serializeRecipe(recipe: RecipeWithVersions) {
  const v = recipe.versions?.[0] ?? null
  return enforceContract(recipeResponseSchema, {
    id: recipe.id,
    authorUserId: recipe.authorUserId,
    cropTypeId: recipe.cropTypeId,
    name: recipe.name,
    description: recipe.description,
    visibility: recipe.visibility,
    archived: recipe.archivedAt !== null,
    currentVersion: v
      ? {
          id: v.id,
          number: v.number,
          harvestWindowStartDays: v.harvestWindowStartDays,
          harvestWindowEndDays: v.harvestWindowEndDays,
          operations: v.operations,
          note: v.note,
          referenced: v.referencedAt !== null,
          createdAt: v.createdAt,
        }
      : null,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  }, 'recipe')
}

function entryFrom(recipe: RecipeWithVersions, fieldId: string | null): ResolvedRecipeEntry | null {
  const v = recipe.versions?.[0]
  if (!v || recipe.archivedAt !== null) return null
  return enforceContract(resolvedRecipeEntrySchema, {
    cropTypeId: recipe.cropTypeId,
    fieldId,
    recipeId: recipe.id,
    recipeName: recipe.name,
    authorUserId: recipe.authorUserId,
    versionId: v.id,
    versionNumber: v.number,
    harvestWindowStartDays: v.harvestWindowStartDays,
    harvestWindowEndDays: v.harvestWindowEndDays,
    operations: v.operations,
  }, 'resolvedRecipeEntry')
}

// The R2 resolution ladder, materialized for one farm: per crop the
// farm-level winner (farm default → the farm OWNER's personal default →
// system recipe), plus explicit field-default entries that win inside
// their field. The planter's own recipes never apply — the owner's plan
// governs the farm.
export async function resolveFarmRecipes(farmId: string, ownerUserId: string) {
  const [defaults, systemRecipes] = await Promise.all([
    prisma.recipeDefault.findMany({
      where: { OR: [{ farmId }, { userId: ownerUserId }] },
      include: { recipe: { include: { versions: currentVersionInclude } } },
    }),
    prisma.recipe.findMany({
      where: { authorUserId: null, archivedAt: null },
      include: { versions: currentVersionInclude },
    }),
  ])

  const farmLevel = new Map<string, ResolvedRecipeEntry>()
  const put = (cropTypeId: string, entry: ResolvedRecipeEntry | null) => {
    if (entry && !farmLevel.has(cropTypeId)) farmLevel.set(cropTypeId, entry)
  }

  // Ladder order: each rung only fills crops the rung above left open.
  for (const d of defaults.filter(d => d.farmId === farmId && !d.fieldId)) {
    put(d.cropTypeId, entryFrom(d.recipe, null))
  }
  for (const d of defaults.filter(d => d.userId === ownerUserId)) {
    put(d.cropTypeId, entryFrom(d.recipe, null))
  }
  for (const r of systemRecipes) {
    put(r.cropTypeId, entryFrom(r, null))
  }

  const fieldLevel = defaults
    .filter(d => d.farmId === farmId && d.fieldId)
    .map(d => entryFrom(d.recipe, d.fieldId))
    .filter((e): e is ResolvedRecipeEntry => e !== null)

  return [...fieldLevel, ...farmLevel.values()]
}

// Planting payloads carry client-supplied version ids — keep only ones
// that exist so a stale/foreign id degrades to "no reference" instead of
// a foreign-key 500.
export async function knownRecipeVersionIds(ids: Array<string | null | undefined>): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))]
  if (wanted.length === 0) return new Set()
  const rows = await prisma.recipeVersion.findMany({
    where: { id: { in: wanted } },
    select: { id: true },
  })
  return new Set(rows.map(r => r.id))
}

// R1: the first planting that stamps from a version freezes it.
export async function markVersionsReferenced(ids: Array<string | null | undefined>) {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))]
  if (wanted.length === 0) return
  await prisma.recipeVersion.updateMany({
    where: { id: { in: wanted }, referencedAt: null },
    data: { referencedAt: new Date() },
  })
}
