import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId } from '../lib/validate'

const router = Router({ mergeParams: true }) // mounted at /api/v1/farms/:farmId/harvests

router.use(requireAuth)

async function requireFarmOwnership(userId: string, farmId: string) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, userId, deletedAt: { equals: null } },
  })
  if (!farm) throw Errors.notFound('Farm')
  return farm
}

// Prisma returns Decimal for quantity — convert to number
function serializeHarvest(harvest: any) {
  return {
    ...harvest,
    quantity: Number(harvest.quantity),
  }
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/harvests
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    await requireFarmOwnership(userId, farmId)

    const harvests = await prisma.harvestYield.findMany({
      where: { farmId, deletedAt: { equals: null } },
      orderBy: { harvestDate: 'desc' },
    })

    res.json({ success: true, data: harvests.map(serializeHarvest) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/harvests
// ─────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    requireFields(req.body, ['cropTypeId', 'quantity', 'unit', 'harvestDate'])
    await requireFarmOwnership(userId, farmId)

    const { fieldId, cropTypeId, quantity, unit, harvestDate, notes } = req.body

    // If fieldId provided, verify it belongs to this farm
    if (fieldId) {
      const field = await prisma.field.findFirst({
        where: { id: fieldId, farmId, deletedAt: { equals: null } },
      })
      if (!field) throw Errors.notFound('Field')
    }

    const harvest = await prisma.harvestYield.create({
      data: {
        farmId,
        fieldId: fieldId ?? null,
        cropTypeId,
        quantity,
        unit,
        harvestDate: new Date(harvestDate),
        notes: notes ?? null,
      },
    })

    res.status(201).json({ success: true, data: serializeHarvest(harvest) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/harvests/:id
// ─────────────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Harvest')
    await requireFarmOwnership(userId, farmId)

    const harvest = await prisma.harvestYield.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!harvest) throw Errors.notFound('Harvest')

    res.json({ success: true, data: serializeHarvest(harvest) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// PATCH /api/v1/farms/:farmId/harvests/:id
// ─────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Harvest')
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.harvestYield.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!existing) throw Errors.notFound('Harvest')

    const { fieldId, cropTypeId, quantity, unit, harvestDate, notes } = req.body

    if (fieldId !== undefined && fieldId !== null) {
      const field = await prisma.field.findFirst({
        where: { id: fieldId, farmId, deletedAt: { equals: null } },
      })
      if (!field) throw Errors.notFound('Field')
    }

    const updateData: Record<string, unknown> = {}
    if (fieldId !== undefined) updateData.fieldId = fieldId
    if (cropTypeId !== undefined) updateData.cropTypeId = cropTypeId
    if (quantity !== undefined) updateData.quantity = quantity
    if (unit !== undefined) updateData.unit = unit
    if (harvestDate !== undefined) updateData.harvestDate = new Date(harvestDate)
    if (notes !== undefined) updateData.notes = notes

    const updated = await prisma.harvestYield.update({
      where: { id },
      data: updateData,
    })

    res.json({ success: true, data: serializeHarvest(updated) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/v1/farms/:farmId/harvests/:id  (soft delete)
// ─────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Harvest')
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.harvestYield.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!existing) throw Errors.notFound('Harvest')

    await prisma.harvestYield.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    res.json({ success: true, data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router