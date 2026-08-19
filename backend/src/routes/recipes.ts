import { Router, Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import { parseBody } from '../lib/validate'
import { requireAuth } from '../middleware/auth'
import { requireFarmRole } from '../lib/farmAccess'
import { enforceContract } from '../contracts/enforce'
import {
  createRecipeRequestSchema, updateRecipeRequestSchema, updateRecipeScheduleRequestSchema,
  setRecipeDefaultRequestSchema, resolvedRecipesResponseSchema,
  recipeDefaultsResponseSchema, recipeEvidenceResponseSchema, ScheduleInput,
} from '../contracts/recipeContract'
import { serializeRecipe, currentVersionInclude, resolveFarmRecipes } from '../lib/recipes'

// ──────────────────────────────────────────────────────────────────────────
// Recipes — user-authored practice per crop (Recetas de Cultivo design).
// Authorship is per-user; only the author edits (R4). Versions freeze on
// first planting reference and edits mint the next number (R1). Defaults
// decide what stamps at planting via the R2 ladder; farm/field scopes are
// owner/admin territory and pick from the farm OWNER's recipes.
// ──────────────────────────────────────────────────────────────────────────

const router = Router()

// Operation templates are stored as JSON; ids the client omitted are
// filled server-side so templates stay addressable (check-off carryover
// matches on templateId).
function templatesWithIds(schedule: ScheduleInput) {
  return schedule.operations.map(op => ({ ...op, id: op.id ?? randomUUID() }))
}

async function findOwnRecipe(userId: string, recipeId: string) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, authorUserId: userId },
    include: { versions: currentVersionInclude },
  })
  if (!recipe) throw Errors.notFound('Recipe')
  return recipe
}

// ── GET /api/v1/recipes — system recipes plus the caller's own ─────────
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const cropTypeId = req.query.cropTypeId ? String(req.query.cropTypeId) : undefined
    const includeArchived = req.query.includeArchived === '1'
    const recipes = await prisma.recipe.findMany({
      where: {
        OR: [{ authorUserId: null }, { authorUserId: userId }],
        ...(cropTypeId ? { cropTypeId } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: { versions: currentVersionInclude },
      orderBy: [{ cropTypeId: 'asc' }, { name: 'asc' }],
    })
    res.json({ success: true, data: recipes.map(serializeRecipe) })
  } catch (err) { next(err) }
})

// ── GET /api/v1/recipes/resolved?farmId= — the R2 ladder for a farm ────
// Any member may read: operators plant with these. The planter's own
// recipes never appear — the farm owner's plan governs.
router.get('/resolved', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = String(req.query.farmId ?? '')
    if (!farmId) throw Errors.validation('farmId is required')
    const { farm } = await requireFarmRole(req.user!.userId, farmId, 'operator')
    const entries = await resolveFarmRecipes(farmId, farm.userId)
    res.json({
      success: true,
      data: enforceContract(resolvedRecipesResponseSchema, { farmId, entries }, 'resolvedRecipes'),
    })
  } catch (err) { next(err) }
})

// ── GET /api/v1/recipes/defaults?farmId= — the raw default pointers ────
// The caller's personal defaults, plus the farm's defaults when farmId is
// given (member-visible — operators see what the farm plants by).
router.get('/defaults', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const farmId = req.query.farmId ? String(req.query.farmId) : null
    if (farmId) await requireFarmRole(userId, farmId, 'operator')

    const rows = await prisma.recipeDefault.findMany({
      where: farmId ? { OR: [{ userId }, { farmId }] } : { userId },
    })
    res.json({
      success: true,
      data: enforceContract(recipeDefaultsResponseSchema, {
        personal: rows
          .filter(r => r.userId === userId)
          .map(r => ({ cropTypeId: r.cropTypeId, recipeId: r.recipeId })),
        farm: rows
          .filter(r => r.farmId !== null && r.farmId === farmId)
          .map(r => ({ cropTypeId: r.cropTypeId, recipeId: r.recipeId, fieldId: r.fieldId })),
      }, 'recipeDefaults'),
    })
  } catch (err) { next(err) }
})

// Adherence over a planting's stamped calendar rows: what separates
// proof from anecdote (R5). pct counts only DECIDED ops — an in-season
// planting's open ops aren't failures.
function adherenceOf(recommended: Array<{ status: string; completedDate: Date | null; recommendedDate: Date }>) {
  const completed = recommended.filter(op => op.status === 'completed')
  const skipped = recommended.filter(op => op.status === 'skipped').length
  const open = recommended.length - completed.length - skipped
  const drifts = completed
    .filter(op => op.completedDate)
    .map(op => Math.round((op.completedDate!.getTime() - op.recommendedDate.getTime()) / 86_400_000))
  const decided = completed.length + skipped
  return {
    total: recommended.length,
    completed: completed.length,
    skipped,
    open,
    pct: decided > 0 ? Math.round((completed.length / decided) * 100) : null,
    avgDriftDays: drifts.length > 0 ? Math.round(drifts.reduce((a, b) => a + b, 0) / drifts.length) : null,
  }
}

// ── GET /api/v1/recipes/:id/evidence — what each version produced ──────
// Plantings that referenced the recipe's versions, scoped to farms the
// caller owns or belongs to, with yield (via the harvest check-off's
// operation link) and adherence. Versions come newest-first, so v(n)
// sits directly above v(n−1) — the comparison is the layout.
router.get('/:id/evidence', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const recipeId = String(req.params.id)
    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, OR: [{ authorUserId: null }, { authorUserId: userId }] },
    })
    if (!recipe) throw Errors.notFound('Recipe')

    const versions = await prisma.recipeVersion.findMany({
      where: { recipeId },
      orderBy: { number: 'desc' },
    })
    const events = await prisma.plantingEvent.findMany({
      where: {
        recipeVersionId: { in: versions.map(v => v.id) },
        isSimulated: false,
        field: {
          deletedAt: { equals: null },
          farm: {
            deletedAt: { equals: null },
            OR: [{ userId }, { members: { some: { userId } } }],
          },
        },
      },
      include: {
        field: { select: { name: true, farm: { select: { name: true } } } },
        recommended: { select: { status: true, completedDate: true, recommendedDate: true } },
      },
      orderBy: { plantingDate: 'desc' },
    })
    const yieldRows = events.length > 0
      ? await prisma.harvestYield.findMany({
          where: {
            deletedAt: { equals: null },
            operation: { plantingEventId: { in: events.map(e => e.id) } },
          },
          select: {
            quantity: true, unit: true, revenue: true,
            operation: { select: { plantingEventId: true } },
          },
        })
      : []

    const sumYields = (rows: typeof yieldRows) => {
      const byUnit = new Map<string, number>()
      let revenue: number | null = null
      for (const y of rows) {
        byUnit.set(y.unit, (byUnit.get(y.unit) ?? 0) + Number(y.quantity))
        if (y.revenue !== null) revenue = (revenue ?? 0) + Number(y.revenue)
      }
      return {
        yields: [...byUnit.entries()].map(([unit, quantity]) => ({ unit, quantity })),
        revenue,
      }
    }

    const data = {
      recipeId,
      versions: versions.map(v => {
        const vEvents = events.filter(e => e.recipeVersionId === v.id)
        const plantings = vEvents.map(e => {
          const own = yieldRows.filter(y => y.operation?.plantingEventId === e.id)
          return {
            id: e.id,
            farmName: e.field.farm.name,
            fieldName: e.field.name,
            plantingDate: e.plantingDate.toISOString().slice(0, 10),
            plantCount: e.plantCount,
            adherence: adherenceOf(e.recommended),
            ...sumYields(own),
          }
        })
        const allOps = vEvents.flatMap(e => e.recommended)
        const allYields = yieldRows.filter(y =>
          vEvents.some(e => e.id === y.operation?.plantingEventId)
        )
        return {
          versionId: v.id,
          number: v.number,
          note: v.note,
          createdAt: v.createdAt,
          plantings,
          totals: {
            plantings: vEvents.length,
            plants: vEvents.reduce((sum, e) => sum + e.plantCount, 0),
            adherence: adherenceOf(allOps),
            ...sumYields(allYields),
          },
        }
      }),
    }
    res.json({ success: true, data: enforceContract(recipeEvidenceResponseSchema, data, 'recipeEvidence') })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/recipes/defaults — set/clear a default (R2 scopes) ─────
// Registered BEFORE the /:id routes so "defaults" never matches as an id.
// user: my personal default. farm/field: what this farm plants by —
// owner/admin only, picking from the farm OWNER's recipes or system ones.
router.put('/defaults', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const body = parseBody(setRecipeDefaultRequestSchema, req.body)

    let scopeWhere: { userId: string | null; farmId: string | null; fieldId: string | null }
    let eligibleAuthorId: string // whose recipes (besides system) may fill this scope

    if (body.scope === 'user') {
      scopeWhere = { userId, farmId: null, fieldId: null }
      eligibleAuthorId = userId
    } else {
      if (!body.farmId) throw Errors.validation('farmId is required for farm/field scope')
      const { farm } = await requireFarmRole(userId, body.farmId, 'admin')
      eligibleAuthorId = farm.userId
      if (body.scope === 'field') {
        if (!body.fieldId) throw Errors.validation('fieldId is required for field scope')
        const field = await prisma.field.findFirst({
          where: { id: body.fieldId, farmId: body.farmId, deletedAt: { equals: null } },
        })
        if (!field) throw Errors.notFound('Field')
        scopeWhere = { userId: null, farmId: body.farmId, fieldId: body.fieldId }
      } else {
        scopeWhere = { userId: null, farmId: body.farmId, fieldId: null }
      }
    }

    if (body.recipeId === null) {
      await prisma.recipeDefault.deleteMany({ where: { cropTypeId: body.cropTypeId, ...scopeWhere } })
      res.json({ success: true, data: { cleared: true } })
      return
    }

    const recipe = await prisma.recipe.findFirst({
      where: {
        id: body.recipeId,
        cropTypeId: body.cropTypeId,
        archivedAt: null,
        OR: [{ authorUserId: null }, { authorUserId: eligibleAuthorId }],
      },
    })
    if (!recipe) throw Errors.notFound('Recipe')

    // NULL-distinct compound unique — find-then-write, never blind create.
    const existing = await prisma.recipeDefault.findFirst({
      where: { cropTypeId: body.cropTypeId, ...scopeWhere },
    })
    if (existing) {
      await prisma.recipeDefault.update({ where: { id: existing.id }, data: { recipeId: recipe.id } })
    } else {
      await prisma.recipeDefault.create({
        data: { cropTypeId: body.cropTypeId, recipeId: recipe.id, ...scopeWhere },
      })
    }
    res.json({ success: true, data: { cropTypeId: body.cropTypeId, recipeId: recipe.id, scope: body.scope } })
  } catch (err) { next(err) }
})

// ── POST /api/v1/recipes — author a recipe (born as v1) ────────────────
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const body = parseBody(createRecipeRequestSchema, req.body)

    const crop = await prisma.cropType.findFirst({
      where: { id: body.cropTypeId, OR: [{ isBuiltIn: true }, { userId }] },
    })
    if (!crop) throw Errors.notFound('Crop')

    const recipe = await prisma.recipe.create({
      data: {
        authorUserId: userId,
        cropTypeId: body.cropTypeId,
        name: body.name,
        description: body.description ?? null,
        versions: {
          create: {
            number: 1,
            harvestWindowStartDays: body.schedule.harvestWindowStartDays,
            harvestWindowEndDays: body.schedule.harvestWindowEndDays,
            operations: templatesWithIds(body.schedule),
          },
        },
      },
      include: { versions: currentVersionInclude },
    })
    res.status(201).json({ success: true, data: serializeRecipe(recipe) })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/recipes/:id — rename / describe own recipe ─────────────
router.put('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const recipeId = String(req.params.id)
    await findOwnRecipe(userId, recipeId)
    const body = parseBody(updateRecipeRequestSchema, req.body)

    const recipe = await prisma.recipe.update({
      where: { id: recipeId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
      include: { versions: currentVersionInclude },
    })
    res.json({ success: true, data: serializeRecipe(recipe) })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/recipes/:id/schedule — edit the practice (R1) ──────────
// Unreferenced current version → edited in place. Referenced → frozen;
// the edit mints the next version and its evidence starts clean.
router.put('/:id/schedule', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const recipeId = String(req.params.id)
    const recipe = await findOwnRecipe(userId, recipeId)
    const body = parseBody(updateRecipeScheduleRequestSchema, req.body)

    const current = recipe.versions[0]
    const data = {
      harvestWindowStartDays: body.schedule.harvestWindowStartDays,
      harvestWindowEndDays: body.schedule.harvestWindowEndDays,
      operations: templatesWithIds(body.schedule),
      note: body.note ?? null,
    }
    if (current && current.referencedAt === null) {
      await prisma.recipeVersion.update({ where: { id: current.id }, data })
    } else {
      await prisma.recipeVersion.create({
        data: { recipeId, number: (current?.number ?? 0) + 1, ...data },
      })
    }

    const updated = await prisma.recipe.findUniqueOrThrow({
      where: { id: recipeId },
      include: { versions: currentVersionInclude },
    })
    res.json({ success: true, data: serializeRecipe(updated) })
  } catch (err) { next(err) }
})

// ── DELETE /api/v1/recipes/:id — delete, or archive when evidence exists
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const recipeId = String(req.params.id)
    await findOwnRecipe(userId, recipeId)

    const referenced = await prisma.recipeVersion.count({
      where: { recipeId, referencedAt: { not: null } },
    })
    // Either way it stops being anyone's default.
    await prisma.recipeDefault.deleteMany({ where: { recipeId } })

    if (referenced > 0) {
      // Evidence exists — archive (hidden from pickers, proof survives).
      const recipe = await prisma.recipe.update({
        where: { id: recipeId },
        data: { archivedAt: new Date() },
        include: { versions: currentVersionInclude },
      })
      res.json({ success: true, data: serializeRecipe(recipe) })
    } else {
      await prisma.recipe.delete({ where: { id: recipeId } })
      res.json({ success: true, data: { id: recipeId, deleted: true } })
    }
  } catch (err) { next(err) }
})

export default router
