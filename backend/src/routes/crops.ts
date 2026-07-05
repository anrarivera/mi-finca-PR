import { Router, Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import { parseBody } from '../lib/validate'
import { requireAuth, optionalAuth } from '../middleware/auth'

// ──────────────────────────────────────────────────────────────────────────
// Crop knowledge base (issue #1). Built-in crops are seeded rows
// (isBuiltIn=true, no owner) that anyone can read; custom crops — with an
// optional schedule "recipe" — belong to the user who created them.
// Built-ins are immutable through the API.
// ──────────────────────────────────────────────────────────────────────────

const router = Router()

const opTemplateSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  type: z.enum(['fertilization', 'spray', 'cultivation', 'irrigation', 'monitoring', 'harvest']),
  label: z.string().trim().max(200).optional(),
  labelEs: z.string().trim().min(1).max(200),
  offsetDays: z.number().int().min(0).max(3650),
  notes: z.string().trim().max(1000).optional(),
  notesEs: z.string().trim().max(1000).optional(),
  product: z.string().trim().max(200).optional(),
})

const scheduleSchema = z.object({
  harvestWindowStartDays: z.number().int().min(0).max(36500),
  harvestWindowEndDays: z.number().int().min(0).max(36500),
  operations: z.array(opTemplateSchema).max(100),
}).refine(s => s.harvestWindowEndDays >= s.harvestWindowStartDays, {
  message: 'harvestWindowEndDays must be greater than or equal to harvestWindowStartDays',
})

const cropBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  nameEs: z.string().trim().min(1).max(120),
  emoji: z.string().trim().min(1).max(8).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  schedule: scheduleSchema.nullable().optional(),
})

type ScheduleInput = z.infer<typeof scheduleSchema>

// Operation templates are stored as JSON; ids the client omitted are filled
// in server-side so every template stays addressable.
function templatesWithIds(schedule: ScheduleInput) {
  return schedule.operations.map(op => ({ ...op, id: op.id ?? randomUUID() }))
}

async function findOwnedCustomCrop(userId: string, cropId: string) {
  const crop = await prisma.cropType.findFirst({
    where: { id: cropId, userId, isBuiltIn: false },
  })
  if (!crop) throw Errors.notFound('Crop')
  return crop
}

// ── GET /api/v1/crops — built-ins plus the caller's custom crops ───────
router.get('/', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const crops = await prisma.cropType.findMany({
      where: req.user
        ? { OR: [{ isBuiltIn: true }, { userId: req.user.userId }] }
        : { isBuiltIn: true },
      include: { schedule: true },
      orderBy: [{ isBuiltIn: 'desc' }, { category: 'asc' }, { nameEs: 'asc' }],
    })
    res.json({ success: true, data: crops })
  } catch (err) { next(err) }
})

// ── POST /api/v1/crops — create a custom crop (+ optional recipe) ──────
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = parseBody(cropBodySchema, req.body)
    const crop = await prisma.cropType.create({
      data: {
        userId: req.user!.userId,
        name: body.name ?? body.nameEs,
        nameEs: body.nameEs,
        emoji: body.emoji ?? '🌱',
        category: body.category ?? 'Personalizados',
        isBuiltIn: false,
        ...(body.schedule
          ? {
              schedule: {
                create: {
                  harvestWindowStartDays: body.schedule.harvestWindowStartDays,
                  harvestWindowEndDays: body.schedule.harvestWindowEndDays,
                  operations: templatesWithIds(body.schedule),
                },
              },
            }
          : {}),
      },
      include: { schedule: true },
    })
    res.status(201).json({ success: true, data: crop })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/crops/:id — update own custom crop ─────────────────────
router.put('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cropId = String(req.params.id)
    await findOwnedCustomCrop(req.user!.userId, cropId)
    const body = parseBody(cropBodySchema.partial(), req.body)

    const crop = await prisma.cropType.update({
      where: { id: cropId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.nameEs !== undefined ? { nameEs: body.nameEs } : {}),
        ...(body.emoji !== undefined ? { emoji: body.emoji } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        // schedule: undefined → untouched, null → removed, object → replaced
        ...(body.schedule === null
          ? { schedule: { deleteMany: {} } }
          : body.schedule !== undefined
          ? {
              schedule: {
                upsert: {
                  create: {
                    harvestWindowStartDays: body.schedule.harvestWindowStartDays,
                    harvestWindowEndDays: body.schedule.harvestWindowEndDays,
                    operations: templatesWithIds(body.schedule),
                  },
                  update: {
                    harvestWindowStartDays: body.schedule.harvestWindowStartDays,
                    harvestWindowEndDays: body.schedule.harvestWindowEndDays,
                    operations: templatesWithIds(body.schedule),
                  },
                },
              },
            }
          : {}),
      },
      include: { schedule: true },
    })
    res.json({ success: true, data: crop })
  } catch (err) { next(err) }
})

// ── DELETE /api/v1/crops/:id — delete own custom crop ──────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cropId = String(req.params.id)
    await findOwnedCustomCrop(req.user!.userId, cropId)
    // Hard delete: the schedule cascades via the FK.
    await prisma.cropType.delete({ where: { id: cropId } })
    res.json({ success: true, data: { id: cropId } })
  } catch (err) { next(err) }
})

export default router
