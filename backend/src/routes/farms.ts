import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId } from '../lib/validate'
import { calculateAreaAcres, formatFarm } from '../lib/farmUtils'

const router = Router()

// All farm routes require authentication
router.use(requireAuth)

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms
// List all farms for the authenticated user
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farms = await prisma.farm.findMany({
      where: {
        userId: req.user!.userId,
        deletedAt: null,
      },
      include: {
        fields: {
          where: { deletedAt: { equals: null } },
          select: { id: true },
        }
      },
      orderBy: [
        { isFavorite: 'desc' },  // favorite first
        { createdAt: 'asc' },
      ]
    })

    res.json({
      success: true,
      data: farms.map(formatFarm)
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms
// Create a new farm
// ─────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, location, farmType, description } = req.body

    requireFields(req.body, ['name', 'location'])

    // Validate farmType if provided
    const validTypes = ['crop', 'livestock', 'mixed', 'apiary']
    if (farmType && !validTypes.includes(farmType)) {
      throw Errors.validation(
        `farmType must be one of: ${validTypes.join(', ')}`
      )
    }

    // Check if this will be the user's first farm
    // If so, automatically set it as favorite
    const existingCount = await prisma.farm.count({
      where: { userId: req.user!.userId, deletedAt: null }
    })
    const shouldBeFavorite = existingCount === 0

    const farm = await prisma.farm.create({
      data: {
        userId: req.user!.userId,
        name: name.trim(),
        location: location.trim(),
        farmType: farmType ?? 'mixed',
        description: description?.trim() ?? null,
        isFavorite: shouldBeFavorite,
        boundary: [],
        totalAreaAcres: 0,
      },
      include: {
        fields: {
          where: { deletedAt: { equals: null } },
          select: { id: true }
        }
      }
    })

    res.status(201).json({
      success: true,
      data: formatFarm(farm)
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:id
// Get a specific farm
// ─────────────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    requireValidId(id, 'Farm')

    const farm = await prisma.farm.findFirst({
      where: {
        id,
        userId: req.user!.userId,  // scoped to requesting user
        deletedAt: null,
      },
      include: {
        fields: {
          where: { deletedAt: { equals: null } },
          select: { id: true }
        }
      }
    })

    if (!farm) throw Errors.notFound('Farm')

    res.json({ success: true, data: formatFarm(farm) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// PATCH /api/v1/farms/:id
// Update a farm — name, location, boundary, farmType, isFavorite, description
// ─────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    requireValidId(id, 'Farm')

    // Verify farm belongs to this user
    const existing = await prisma.farm.findFirst({
      where: { id, userId: req.user!.userId, deletedAt: null }
    })
    if (!existing) throw Errors.notFound('Farm')

    const { name, location, farmType, description, boundary, isFavorite } = req.body

    // Validate farmType if provided
    const validTypes = ['crop', 'livestock', 'mixed', 'apiary']
    if (farmType && !validTypes.includes(farmType)) {
      throw Errors.validation(`farmType must be one of: ${validTypes.join(', ')}`)
    }

    // If setting this farm as favorite, unset all other farms first
    if (isFavorite === true) {
      await prisma.farm.updateMany({
        where: { userId: req.user!.userId, deletedAt: null },
        data: { isFavorite: false }
      })
    }

    // Calculate area if boundary is being updated
    let totalAreaAcres: number | undefined
    if (boundary && Array.isArray(boundary) && boundary.length >= 3) {
      totalAreaAcres = calculateAreaAcres(boundary)
    }

    // Build update object — only include fields that were provided
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (location !== undefined) updateData.location = location.trim()
    if (farmType !== undefined) updateData.farmType = farmType
    if (description !== undefined) updateData.description = description?.trim() ?? null
    if (boundary !== undefined) updateData.boundary = boundary
    if (totalAreaAcres !== undefined) updateData.totalAreaAcres = totalAreaAcres
    if (isFavorite !== undefined) updateData.isFavorite = isFavorite

    const updated = await prisma.farm.update({
      where: { id },
      data: updateData,
      include: {
        fields: {
          where: { deletedAt: { equals: null } },
          select: { id: true }
        }
      }
    })

    res.json({ success: true, data: formatFarm(updated) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/v1/farms/:id
// Soft delete a farm — also soft deletes all its fields
// ─────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    requireValidId(id, 'Farm')

    // Verify farm belongs to this user
    const existing = await prisma.farm.findFirst({
      where: { id, userId: req.user!.userId, deletedAt: null }
    })
    if (!existing) throw Errors.notFound('Farm')

    const now = new Date()

    // Soft delete all fields belonging to this farm
    await prisma.field.updateMany({
      where: { farmId: id, deletedAt: null },
      data: { deletedAt: now }
    })

    // Soft delete the farm
    await prisma.farm.update({
      where: { id },
      data: { deletedAt: now }
    })

    // If deleted farm was the favorite, set the next available farm as favorite
    if (existing.isFavorite) {
      const nextFarm = await prisma.farm.findFirst({
        where: { userId: req.user!.userId, deletedAt: null },
        orderBy: { createdAt: 'asc' }
      })
      if (nextFarm) {
        await prisma.farm.update({
          where: { id: nextFarm.id },
          data: { isFavorite: true }
        })
      }
    }

    res.json({
      success: true,
      data: { message: 'Farm deleted successfully' }
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:id/summary
// Dashboard summary for a specific farm
// ─────────────────────────────────────────────────────────────────────
router.get('/:id/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    requireValidId(id, 'Farm')

    const farm = await prisma.farm.findFirst({
      where: { id, userId: req.user!.userId, deletedAt: { equals: null } }
    })
    if (!farm) throw Errors.notFound('Farm')

    const fieldCount = await prisma.field.count({
      where: { farmId: id, deletedAt: { equals: null } }
    })

    const lastOperation = await prisma.operation.findFirst({
      where: { farmId: id },
      orderBy: { createdAt: 'desc' },
      select: { type: true, actualDate: true }
    })

    res.json({
      success: true,
      data: {
        farmId: id,
        fieldCount,
        totalAreaAcres: parseFloat(farm.totalAreaAcres?.toString() ?? '0'),
        operationHealth: { overdue: 0, dueSoon: 0 },
        lastOperation: lastOperation ?? null,
      }
    })
  } catch (err) {
    next(err)
  }
})

export default router