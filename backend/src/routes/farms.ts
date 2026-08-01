import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId, requireBoundaryBounds } from '../lib/validate'
import { calculateAreaAcres, formatFarm } from '../lib/farmUtils'
import { requireFarmRole } from '../lib/farmAccess'
import { hashInviteCode } from '../lib/farmInvites'

const router = Router()

// All farm routes require authentication
router.use(requireAuth)

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms
// List all farms for the authenticated user
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId
    const farms = await prisma.farm.findMany({
      // GET / — farms the user owns PLUS farms they're a member of
      where: {
        deletedAt: { equals: null },
        OR: [
          { userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        fields: {
          where: { deletedAt: { equals: null } },
          select: { id: true },
        },
        members: { where: { userId }, select: { role: true } },
      },
      orderBy: [
        { isFavorite: 'desc' },  // favorite first
        { createdAt: 'asc' },
      ]
    })

    res.json({
      success: true,
      // myRole lets the client hide UI the server would reject anyway
      data: farms.map(f => ({
        ...formatFarm(f),
        myRole: f.userId === userId ? 'owner' : (f.members[0]?.role ?? 'operator'),
      }))
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
      // POST / — count existing farms
      where: { userId: req.user!.userId, deletedAt: { equals: null } } 
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
// POST /api/v1/farms/join  { code }
// Redeem a join code — membership is immediate with the role baked into
// the code. Works right after registration or from an existing account.
// ─────────────────────────────────────────────────────────────────────
router.post('/join', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireFields(req.body, ['code'])
    const userId = req.user!.userId

    const invite = await prisma.farmInvite.findUnique({
      where: { codeHash: hashInviteCode(req.body.code) },
      include: { farm: true },
    })
    if (
      !invite || invite.revokedAt !== null ||
      invite.expiresAt < new Date() || invite.farm.deletedAt !== null
    ) {
      throw Errors.validation(
        'Código inválido o vencido — pide uno nuevo al equipo de la finca.'
      )
    }
    if (invite.farm.userId === userId) {
      throw Errors.conflict('Ya eres el dueño de esta finca')
    }
    const existing = await prisma.farmMember.findUnique({
      where: { farmId_userId: { farmId: invite.farmId, userId } },
    })
    if (existing) {
      throw Errors.conflict('Ya eres parte del equipo de esta finca')
    }

    const member = await prisma.farmMember.create({
      data: { farmId: invite.farmId, userId, role: invite.role },
    })

    res.status(201).json({
      success: true,
      data: { farmId: invite.farmId, farmName: invite.farm.name, role: member.role },
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

    // Any member (operator+) can view the farm
    const { role } = await requireFarmRole(req.user!.userId, id, 'operator')

    const farm = await prisma.farm.findFirst({
      where: { id, deletedAt: { equals: null } },
      include: {
        fields: {
          where: { deletedAt: { equals: null } },
          select: { id: true }
        }
      }
    })

    if (!farm) throw Errors.notFound('Farm')

    res.json({ success: true, data: { ...formatFarm(farm), myRole: role } })
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

    // Farm structure changes need admin (owner or admin member)
    await requireFarmRole(req.user!.userId, id, 'admin')

    const { name, location, farmType, description, boundary, isFavorite } = req.body

    // Validate farmType if provided
    const validTypes = ['crop', 'livestock', 'mixed', 'apiary']
    if (farmType && !validTypes.includes(farmType)) {
      throw Errors.validation(`farmType must be one of: ${validTypes.join(', ')}`)
    }

    // Boundary points must be real WGS84 coordinates (SRS NFR-4)
    requireBoundaryBounds(boundary, 'boundary')

    // If setting this farm as favorite, unset all other farms first
    if (isFavorite === true) {
      await prisma.farm.updateMany({
        where: { userId: req.user!.userId, deletedAt: { equals: null }, },
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

    // Deleting a farm is owner-only — admins manage it, they don't end it
    const { farm: existing } = await requireFarmRole(req.user!.userId, id, 'owner')

    const now = new Date()

    // Soft delete all fields belonging to this farm
    await prisma.field.updateMany({
      where: { farmId: id, deletedAt: { equals: null }, },
      data: { deletedAt: now }
    })

    // Livestock units cascade the same way fields do — mirrors the frontend
    // deleteFarmCascade (store/farmActions.ts).
    await prisma.livestockUnit.updateMany({
      where: { farmId: id, deletedAt: { equals: null }, },
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
        where: { userId: req.user!.userId, deletedAt: { equals: null }, },
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

    // Operation health — real counts from the recommendation calendar.
    // A recommended operation belongs to this farm through either its
    // planting event's field or its livestock unit. Overdue = past its
    // recommended date; dueSoon = inside the next 14 days (SDD §4.6).
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0) // recommendedDate is a date-only column anchored at UTC midnight
    const horizon = new Date(today)
    horizon.setUTCDate(horizon.getUTCDate() + 14)

    const ownedByFarm = {
      OR: [
        { plantingEvent: { field: { farmId: id, deletedAt: { equals: null } } } },
        { livestockUnit: { farmId: id, deletedAt: { equals: null } } },
      ],
    }
    const [overdue, dueSoon] = await Promise.all([
      prisma.recommendedOperation.count({
        where: {
          ...ownedByFarm,
          status: { in: ['pending', 'due'] },
          recommendedDate: { lt: today },
        },
      }),
      prisma.recommendedOperation.count({
        where: {
          ...ownedByFarm,
          status: { in: ['pending', 'due'] },
          recommendedDate: { gte: today, lte: horizon },
        },
      }),
    ])

    res.json({
      success: true,
      data: {
        farmId: id,
        fieldCount,
        totalAreaAcres: parseFloat(farm.totalAreaAcres?.toString() ?? '0'),
        operationHealth: { overdue, dueSoon },
        lastOperation: lastOperation ?? null,
      }
    })
  } catch (err) {
    next(err)
  }
})

export default router