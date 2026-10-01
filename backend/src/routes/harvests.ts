import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId, requireRevenue, requireQuantity, parseBody } from '../lib/validate'
import { requireFarmRole } from '../lib/farmAccess'

import { enforceContract } from '../contracts/enforce'
import {
  harvestResponseSchema, createHarvestRequestSchema, updateHarvestRequestSchema,
} from '../contracts/harvestContract'

const router = Router({ mergeParams: true }) // mounted at /api/v1/farms/:farmId/harvests

router.use(requireAuth)

// Activity router — operators and up (SDD roles: logging harvests is
// operator work).
const requireFarmOwnership = (userId: string, farmId: string) =>
  requireFarmRole(userId, farmId, 'operator')

// Prisma returns Decimal for quantity — convert to number
function serializeHarvest(harvest: any) {
  return enforceContract(harvestResponseSchema, {
    ...harvest,
    quantity: Number(harvest.quantity),
    revenue: harvest.revenue != null ? Number(harvest.revenue) : null,
  }, 'harvest')
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
// GET /api/v1/farms/:farmId/harvests/export?format=csv
// The unified production ledger (crops + animal products + revenue) as
// CSV — what goes to the accountant. Registered before /:id so "export"
// is not captured as an id param.
// ─────────────────────────────────────────────────────────────────────
router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    const { farm } = await requireFarmOwnership(userId, farmId)

    const format = String(req.query.format ?? 'csv').toLowerCase()
    if (format !== 'csv') {
      throw Errors.validation('Only CSV export is supported (format=csv)')
    }

    const entries = await prisma.harvestYield.findMany({
      where: { farmId, deletedAt: { equals: null } },
      include: {
        field: { select: { name: true } },
        livestockUnit: { select: { name: true } },
      },
      orderBy: { harvestDate: 'desc' },
    })

    // Minimal CSV escaping: wrap in quotes, double any embedded quotes.
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const toDateStr = (d: Date) => d.toISOString().split('T')[0]

    const header = 'date,kind,crop_or_product,field,livestock_unit,quantity,unit,revenue,notes'
    const rows = entries.map(e =>
      [
        toDateStr(e.harvestDate),
        e.productId ? 'animal' : 'crop',
        e.productId ?? e.cropTypeId ?? '',
        e.field?.name ?? '',
        e.livestockUnit?.name ?? '',
        Number(e.quantity),
        e.unit,
        e.revenue !== null ? Number(e.revenue) : '',
        e.notes ?? '',
      ].map(esc).join(',')
    )

    const filename = `produccion-${farm.name.replace(/[^\w\-]+/g, '_')}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send([header, ...rows].join('\n'))
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
    parseBody(createHarvestRequestSchema, req.body)
    await requireFarmOwnership(userId, farmId)

    const { fieldId, cropTypeId, quantity, unit, harvestDate, notes, revenue } = req.body
    requireRevenue(revenue)
    requireQuantity(quantity)

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
        revenue: revenue ?? null,
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

    const { fieldId, cropTypeId, quantity, unit, harvestDate, notes, revenue } = req.body
    parseBody(updateHarvestRequestSchema, req.body)
    requireRevenue(revenue)
    requireQuantity(quantity)

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
    if (revenue !== undefined) updateData.revenue = revenue

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