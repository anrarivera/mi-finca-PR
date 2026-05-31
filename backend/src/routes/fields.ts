// backend/src/routes/fields.ts
import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId } from '../lib/validate'

const router = Router({ mergeParams: true })

// Helper: verify farm belongs to requesting user
async function requireFarmOwnership(userId: string, farmId: string) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, userId, deletedAt: { equals: null } },
  })
  if (!farm) throw Errors.notFound('Farm')
  return farm
}

// Prisma returns Decimal objects — convert to numbers for JSON
function serializeField(field: any) {
  return {
    ...field,
    widthFt: Number(field.widthFt),
    heightFt: Number(field.heightFt),
    farmLat: Number(field.farmLat),
    farmLng: Number(field.farmLng),
  }
}

// GET /api/v1/farms/:farmId/fields
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const userId = req.user!.userId;

    await requireFarmOwnership(userId, farmId)

    const fields = await prisma.field.findMany({
      where: { farmId, deletedAt: { equals: null } },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ success: true, data: { fields: fields.map(serializeField) } })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/farms/:farmId/fields
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const userId = req.user!.userId;
    const {
      name,
      color,
      shape,
      boundary,
      widthFt,
      heightFt,
      farmLat,
      farmLng,
      displayMode,
      isPositioning,
      isSimulated,
      farmModelId,
    } = req.body

    requireFields(req.body, ['name', 'color', 'shape', 'widthFt', 'heightFt', 'farmLat', 'farmLng']);
    
    await requireFarmOwnership(userId, farmId)

    const field = await prisma.field.create({
      data: {
        farmId,
        name,
        color,
        shape,
        boundary: boundary ?? [],
        widthFt,
        heightFt,
        farmLat,
        farmLng,
        displayMode: displayMode ?? 'shape',
        isPositioning: isPositioning ?? false,
        isSimulated: isSimulated ?? false,
        farmModelId: farmModelId ?? null,
      },
    })

    res.status(201).json({ success: true, data: { field: serializeField(field) } })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/v1/farms/:farmId/fields/:id
router.patch('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const id = req.params.id as string;
    const userId = req.user!.userId;

    requireValidId(id)
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.field.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!existing) throw Errors.notFound('Field')

    const {
      name,
      color,
      shape,
      boundary,
      widthFt,
      heightFt,
      farmLat,
      farmLng,
      displayMode,
      isPositioning,
      isSimulated,
      farmModelId,
    } = req.body

    const field = await prisma.field.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(shape !== undefined && { shape }),
        ...(boundary !== undefined && { boundary }),
        ...(widthFt !== undefined && { widthFt }),
        ...(heightFt !== undefined && { heightFt }),
        ...(farmLat !== undefined && { farmLat }),
        ...(farmLng !== undefined && { farmLng }),
        ...(displayMode !== undefined && { displayMode }),
        ...(isPositioning !== undefined && { isPositioning }),
        ...(isSimulated !== undefined && { isSimulated }),
        ...(farmModelId !== undefined && { farmModelId }),
      },
    })

    res.json({ success: true, data: { field: serializeField(field) } })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/farms/:farmId/fields/:id  (soft delete)
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const id = req.params.id as string;
    const userId = req.user!.userId;

    requireValidId(id)
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.field.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!existing) throw Errors.notFound('Field')

    await prisma.field.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    res.json({ success: true, data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router