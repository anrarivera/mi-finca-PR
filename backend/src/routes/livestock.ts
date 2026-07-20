import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId } from '../lib/validate'

const router = Router({ mergeParams: true }) // mounted at /api/v1/farms/:farmId/livestock

router.use(requireAuth)

// Helper: verify farm belongs to requesting user
async function requireFarmOwnership(userId: string, farmId: string) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, userId, deletedAt: { equals: null } },
  })
  if (!farm) throw Errors.notFound('Farm')
  return farm
}

// Prisma returns Decimal for farmLat/farmLng — convert to numbers
function serializeLivestock(unit: any) {
  return {
    ...unit,
    farmLat: unit.farmLat !== null ? Number(unit.farmLat) : null,
    farmLng: unit.farmLng !== null ? Number(unit.farmLng) : null,
  }
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/livestock
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    await requireFarmOwnership(userId, farmId)

    const livestock = await prisma.livestockUnit.findMany({
      where: { farmId, deletedAt: { equals: null } },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ success: true, data: livestock.map(serializeLivestock) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/livestock
// ─────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    requireFields(req.body, ['name', 'animalType', 'currentCount', 'acquisitionDate'])
    await requireFarmOwnership(userId, farmId)

    const { name, animalType, currentCount, acquisitionDate, farmLat, farmLng, notes } = req.body

    const unit = await prisma.livestockUnit.create({
      data: {
        farmId,
        name,
        animalType,
        currentCount,
        acquisitionDate: new Date(acquisitionDate),
        farmLat: farmLat ?? null,
        farmLng: farmLng ?? null,
        notes: notes ?? null,
      },
    })

    res.status(201).json({ success: true, data: serializeLivestock(unit) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/livestock/:id
// ─────────────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Livestock unit')
    await requireFarmOwnership(userId, farmId)

    const unit = await prisma.livestockUnit.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!unit) throw Errors.notFound('Livestock unit')

    res.json({ success: true, data: serializeLivestock(unit) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// PATCH /api/v1/farms/:farmId/livestock/:id
// ─────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Livestock unit')
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.livestockUnit.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!existing) throw Errors.notFound('Livestock unit')

    const { name, animalType, currentCount, acquisitionDate, farmLat, farmLng, notes } = req.body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (animalType !== undefined) updateData.animalType = animalType
    if (currentCount !== undefined) updateData.currentCount = currentCount
    if (acquisitionDate !== undefined) updateData.acquisitionDate = new Date(acquisitionDate)
    if (farmLat !== undefined) updateData.farmLat = farmLat
    if (farmLng !== undefined) updateData.farmLng = farmLng
    if (notes !== undefined) updateData.notes = notes

    const updated = await prisma.livestockUnit.update({
      where: { id },
      data: updateData,
    })

    res.json({ success: true, data: serializeLivestock(updated) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/v1/farms/:farmId/livestock/:id  (soft delete)
// ─────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Livestock unit')
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.livestockUnit.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!existing) throw Errors.notFound('Livestock unit')

    await prisma.livestockUnit.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    res.json({ success: true, data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router