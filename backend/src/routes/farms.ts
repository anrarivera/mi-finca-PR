import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import { parseBody } from '../lib/validate'
import { requireAuth } from '../middleware/auth'

// ──────────────────────────────────────────────────────────────────────────
// Farm CRUD + nested field list/create. All routes require auth; every
// query is scoped to the authenticated user so one user can never read or
// mutate another user's farms. Deletes are soft (deletedAt), matching the
// Prisma schema.
// ──────────────────────────────────────────────────────────────────────────

const router = Router()
router.use(requireAuth)

const latLngSchema = z.object({ lat: z.number(), lng: z.number() })

const farmBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).default(''),
  farmType: z.string().trim().max(40).optional(),
  boundary: z.array(latLngSchema).max(1000).optional(),
  totalAreaAcres: z.number().min(0).optional(),
  isFavorite: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
})

const fieldBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().max(20),
  shape: z.enum(['rectangle', 'polygon']),
  boundary: z.array(latLngSchema).max(1000).default([]),
  widthFt: z.number().min(0),
  heightFt: z.number().min(0),
  farmLat: z.number().min(-90).max(90),
  farmLng: z.number().min(-180).max(180),
  displayMode: z.enum(['shape', 'pin']).optional(),
  isPositioning: z.boolean().optional(),
})

// Resolve a farm the current user owns (not soft-deleted) or throw 404.
export async function findOwnedFarm(userId: string, farmId: string) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, userId, deletedAt: null },
  })
  if (!farm) throw Errors.notFound('Farm')
  return farm
}

// ── GET /api/v1/farms — list the user's farms ─────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farms = await prisma.farm.findMany({
      where: { userId: req.user!.userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        fields: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    })
    res.json({ success: true, data: farms })
  } catch (err) { next(err) }
})

// ── POST /api/v1/farms — create a farm ────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = parseBody(farmBodySchema, req.body)
    const farm = await prisma.farm.create({
      data: {
        userId: req.user!.userId,
        name: body.name,
        location: body.location,
        farmType: body.farmType ?? 'mixed',
        boundary: body.boundary ?? [],
        totalAreaAcres: body.totalAreaAcres ?? 0,
        isFavorite: body.isFavorite ?? false,
        description: body.description,
      },
    })
    res.status(201).json({ success: true, data: farm })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/farms/:id — update a farm ─────────────────────────────
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedFarm(req.user!.userId, String(req.params.id))
    const body = parseBody(farmBodySchema.partial(), req.body)
    const farm = await prisma.farm.update({
      where: { id: String(req.params.id) },
      data: body,
    })
    res.json({ success: true, data: farm })
  } catch (err) { next(err) }
})

// ── DELETE /api/v1/farms/:id — soft-delete farm + its fields ──────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedFarm(req.user!.userId, String(req.params.id))
    const now = new Date()
    await prisma.$transaction([
      prisma.field.updateMany({
        where: { farmId: String(req.params.id), deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.livestockUnit.updateMany({
        where: { farmId: String(req.params.id), deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.farm.update({
        where: { id: String(req.params.id) },
        data: { deletedAt: now },
      }),
    ])
    res.json({ success: true, data: { id: String(req.params.id) } })
  } catch (err) { next(err) }
})

// ── GET /api/v1/farms/:id/fields — list fields of a farm ──────────────
router.get('/:id/fields', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedFarm(req.user!.userId, String(req.params.id))
    const fields = await prisma.field.findMany({
      where: { farmId: String(req.params.id), deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ success: true, data: fields })
  } catch (err) { next(err) }
})

// ── POST /api/v1/farms/:id/fields — create a field in a farm ──────────
router.post('/:id/fields', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedFarm(req.user!.userId, String(req.params.id))
    const body = parseBody(fieldBodySchema, req.body)
    const field = await prisma.field.create({
      data: {
        farmId: String(req.params.id),
        name: body.name,
        color: body.color,
        shape: body.shape,
        boundary: body.boundary,
        widthFt: body.widthFt,
        heightFt: body.heightFt,
        farmLat: body.farmLat,
        farmLng: body.farmLng,
        displayMode: body.displayMode ?? 'shape',
        isPositioning: body.isPositioning ?? false,
      },
    })
    res.status(201).json({ success: true, data: field })
  } catch (err) { next(err) }
})

export { fieldBodySchema }
export default router
