import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import { parseBody } from '../lib/validate'
import { requireAuth } from '../middleware/auth'
import { findOwnedFarm } from './farms'

// Livestock unit CRUD, scoped through farm ownership. Matches the frontend
// livestock feature (features/livestock) and the LivestockUnit Prisma model.

const router = Router()
router.use(requireAuth)

const livestockBodySchema = z.object({
  farmId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  animalType: z.enum(['chickens', 'rabbits', 'goats', 'cows', 'pigs', 'bees']),
  currentCount: z.number().int().min(0),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  notes: z.string().trim().max(2000).optional(),
})

async function findOwnedUnit(userId: string, unitId: string) {
  const unit = await prisma.livestockUnit.findFirst({
    where: { id: unitId, deletedAt: null, farm: { userId, deletedAt: null } },
  })
  if (!unit) throw Errors.notFound('Livestock unit')
  return unit
}

// ── GET /api/v1/livestock?farmId= — list units (optionally per farm) ──
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = typeof req.query.farmId === 'string' ? req.query.farmId : undefined
    if (farmId) await findOwnedFarm(req.user!.userId, farmId)
    const units = await prisma.livestockUnit.findMany({
      where: {
        deletedAt: null,
        farm: { userId: req.user!.userId, deletedAt: null },
        ...(farmId && { farmId }),
      },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ success: true, data: units })
  } catch (err) { next(err) }
})

// ── POST /api/v1/livestock ─────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = parseBody(livestockBodySchema, req.body)
    await findOwnedFarm(req.user!.userId, body.farmId)
    const unit = await prisma.livestockUnit.create({
      data: {
        farmId: body.farmId,
        name: body.name,
        animalType: body.animalType,
        currentCount: body.currentCount,
        acquisitionDate: new Date(body.acquisitionDate + 'T00:00:00Z'),
        notes: body.notes,
      },
    })
    res.status(201).json({ success: true, data: unit })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/livestock/:id ──────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedUnit(req.user!.userId, String(req.params.id))
    const body = parseBody(livestockBodySchema.partial().omit({ farmId: true }), req.body)
    const unit = await prisma.livestockUnit.update({
      where: { id: String(req.params.id) },
      data: {
        ...body,
        ...(body.acquisitionDate && {
          acquisitionDate: new Date(body.acquisitionDate + 'T00:00:00Z'),
        }),
      },
    })
    res.json({ success: true, data: unit })
  } catch (err) { next(err) }
})

// ── DELETE /api/v1/livestock/:id — soft delete ─────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedUnit(req.user!.userId, String(req.params.id))
    await prisma.livestockUnit.update({
      where: { id: String(req.params.id) },
      data: { deletedAt: new Date() },
    })
    res.json({ success: true, data: { id: String(req.params.id) } })
  } catch (err) { next(err) }
})

export default router
