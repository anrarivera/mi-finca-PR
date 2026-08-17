import { Router, Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import { parseBody } from '../lib/validate'
import { requireAuth, optionalAuth } from '../middleware/auth'
import { enforceContract } from '../contracts/enforce'
import {
  cropResponseSchema, cropBodyRequestSchema, scheduleRequestSchema, ScheduleInput,
} from '../contracts/cropContract'

// ──────────────────────────────────────────────────────────────────────────
// Crop knowledge base + recipes. Built-in crops are seeded rows
// (isBuiltIn=true, no owner) that anyone can read; custom crops belong to
// the user who created them. A crop's schedule ("recipe") comes in two
// flavors sharing one table: the base row (userId NULL — seeded for
// built-ins, the owner's own recipe for custom crops) and per-user
// override rows on built-ins. Built-in crop IDENTITY stays immutable
// through the API; only their schedules can be overridden, per user.
// ──────────────────────────────────────────────────────────────────────────

const router = Router()

// Operation templates are stored as JSON; ids the client omitted are filled
// in server-side so every template stays addressable.
function templatesWithIds(schedule: ScheduleInput) {
  return schedule.operations.map(op => ({ ...op, id: op.id ?? randomUUID() }))
}

// Collapse a crop's schedule rows into the single wire schedule: the
// viewer's own recipe wins over the base.
function serializeCrop(crop: any, viewerId: string | null) {
  const rows: any[] = crop.schedules ?? []
  const own = viewerId ? rows.find(s => s.userId === viewerId) : undefined
  const base = rows.find(s => s.userId === null)
  const picked = own ?? base ?? null
  const { schedules: _drop, ...rest } = crop
  return enforceContract(cropResponseSchema, {
    ...rest,
    schedule: picked
      ? {
          harvestWindowStartDays: picked.harvestWindowStartDays,
          harvestWindowEndDays: picked.harvestWindowEndDays,
          operations: picked.operations,
        }
      : null,
    scheduleSource: picked ? (own ? 'user' : 'default') : null,
  }, 'crop')
}

// Schedule rows the viewer may see: the base plus their own overrides.
function visibleSchedules(viewerId: string | null) {
  return {
    schedules: {
      where: viewerId
        ? { OR: [{ userId: null }, { userId: viewerId }] }
        : { userId: null as string | null },
    },
  }
}

async function findOwnedCustomCrop(userId: string, cropId: string) {
  const crop = await prisma.cropType.findFirst({
    where: { id: cropId, userId, isBuiltIn: false },
  })
  if (!crop) throw Errors.notFound('Crop')
  return crop
}

// The compound unique treats NULL userId as distinct in Postgres, so base
// rows can't go through upsert — every write is find-then-write.
async function writeScheduleRow(cropTypeId: string, userId: string | null, schedule: ScheduleInput) {
  const data = {
    harvestWindowStartDays: schedule.harvestWindowStartDays,
    harvestWindowEndDays: schedule.harvestWindowEndDays,
    operations: templatesWithIds(schedule),
  }
  const existing = await prisma.cropSchedule.findFirst({ where: { cropTypeId, userId } })
  if (existing) {
    await prisma.cropSchedule.update({ where: { id: existing.id }, data })
  } else {
    await prisma.cropSchedule.create({ data: { cropTypeId, userId, ...data } })
  }
}

async function reloadCrop(cropId: string, viewerId: string | null) {
  const crop = await prisma.cropType.findUniqueOrThrow({
    where: { id: cropId },
    include: visibleSchedules(viewerId),
  })
  return serializeCrop(crop, viewerId)
}

// ── GET /api/v1/crops — built-ins plus the caller's custom crops ───────
router.get('/', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const viewerId = req.user?.userId ?? null
    const crops = await prisma.cropType.findMany({
      where: viewerId
        ? { OR: [{ isBuiltIn: true }, { userId: viewerId }] }
        : { isBuiltIn: true },
      include: visibleSchedules(viewerId),
      orderBy: [{ isBuiltIn: 'desc' }, { category: 'asc' }, { nameEs: 'asc' }],
    })
    res.json({ success: true, data: crops.map(c => serializeCrop(c, viewerId)) })
  } catch (err) { next(err) }
})

// ── POST /api/v1/crops — create a custom crop (+ optional recipe) ──────
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const body = parseBody(cropBodyRequestSchema, req.body)
    const crop = await prisma.cropType.create({
      data: {
        userId,
        name: body.name ?? body.nameEs,
        nameEs: body.nameEs,
        emoji: body.emoji ?? '🌱',
        category: body.category ?? 'Personalizados',
        isBuiltIn: false,
        ...(body.schedule
          ? {
              // A custom crop's own recipe is its base row (userId NULL).
              schedules: {
                create: {
                  harvestWindowStartDays: body.schedule.harvestWindowStartDays,
                  harvestWindowEndDays: body.schedule.harvestWindowEndDays,
                  operations: templatesWithIds(body.schedule),
                },
              },
            }
          : {}),
      },
      include: visibleSchedules(userId),
    })
    res.status(201).json({ success: true, data: serializeCrop(crop, userId) })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/crops/:id — update own custom crop ─────────────────────
router.put('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const cropId = String(req.params.id)
    await findOwnedCustomCrop(userId, cropId)
    const body = parseBody(cropBodyRequestSchema.partial(), req.body)

    // schedule tri-state on the crop's BASE row: undefined → untouched,
    // null → removed, object → replaced.
    if (body.schedule === null) {
      await prisma.cropSchedule.deleteMany({ where: { cropTypeId: cropId, userId: null } })
    } else if (body.schedule !== undefined) {
      await writeScheduleRow(cropId, null, body.schedule)
    }

    await prisma.cropType.update({
      where: { id: cropId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.nameEs !== undefined ? { nameEs: body.nameEs } : {}),
        ...(body.emoji !== undefined ? { emoji: body.emoji } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
      },
    })
    res.json({ success: true, data: await reloadCrop(cropId, userId) })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/crops/:id/schedule — save "mi calendario" for any
// visible crop. On a built-in this writes the caller's override row (the
// seeded default stays untouched for everyone else); on their own custom
// crop it edits the base recipe directly. ──────────────────────────────
router.put('/:id/schedule', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const cropId = String(req.params.id)
    const crop = await prisma.cropType.findFirst({
      where: { id: cropId, OR: [{ isBuiltIn: true }, { userId }] },
    })
    if (!crop) throw Errors.notFound('Crop')

    const schedule = parseBody(scheduleRequestSchema, req.body)
    await writeScheduleRow(cropId, crop.isBuiltIn ? userId : null, schedule)
    res.json({ success: true, data: await reloadCrop(cropId, userId) })
  } catch (err) { next(err) }
})

// ── DELETE /api/v1/crops/:id/schedule — drop the caller's recipe. On a
// built-in this reverts them to the seeded default; on their own custom
// crop it leaves the crop with no recipe. ──────────────────────────────
router.delete('/:id/schedule', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const cropId = String(req.params.id)
    const crop = await prisma.cropType.findFirst({
      where: { id: cropId, OR: [{ isBuiltIn: true }, { userId }] },
    })
    if (!crop) throw Errors.notFound('Crop')

    await prisma.cropSchedule.deleteMany({
      where: { cropTypeId: cropId, userId: crop.isBuiltIn ? userId : null },
    })
    res.json({ success: true, data: await reloadCrop(cropId, userId) })
  } catch (err) { next(err) }
})

// ── DELETE /api/v1/crops/:id — delete own custom crop ──────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cropId = String(req.params.id)
    await findOwnedCustomCrop(req.user!.userId, cropId)
    // Hard delete: schedule rows cascade via the FK.
    await prisma.cropType.delete({ where: { id: cropId } })
    res.json({ success: true, data: { id: cropId } })
  } catch (err) { next(err) }
})

export default router
