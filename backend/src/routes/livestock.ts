import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId, requireLat, requireLng, requireRevenue, requireQuantity, parseBody } from '../lib/validate'
import { requireFarmRole } from '../lib/farmAccess'

import { enforceContract } from '../contracts/enforce'
import {
  livestockResponseSchema, createLivestockRequestSchema, updateLivestockRequestSchema,
  productionRequestSchema,
} from '../contracts/livestockContract'

const router = Router({ mergeParams: true }) // mounted at /api/v1/farms/:farmId/livestock

router.use(requireAuth)

// Helper: verify farm belongs to requesting user
// Reads are operator work; creating/renaming/deleting units is farm
// structure and needs admin (SDD roles — same split as fields).
const requireFarmOwnership = (userId: string, farmId: string) =>
  requireFarmRole(userId, farmId, 'operator')
const requireFarmStructure = (userId: string, farmId: string) =>
  requireFarmRole(userId, farmId, 'admin')

// A herd's corral must be one of this farm's livestock-kind fields.
async function requireCorral(farmId: string, fieldId: string) {
  const corral = await prisma.field.findFirst({
    where: { id: fieldId, farmId, kind: 'livestock', deletedAt: { equals: null } },
  })
  if (!corral) {
    throw Errors.validation('El corral debe ser un campo de animales de esta finca')
  }
  return corral
}

// Products an animal can yield — mirrors the frontend animalLibrary.
// meat products remove animals from the herd (countDelta required).
const ANIMAL_PRODUCTS: Record<string, string[]> = {
  chickens: ['eggs', 'meat'],
  rabbits: ['meat'],
  goats: ['milk', 'meat'],
  cows: ['milk', 'meat'],
  pigs: ['meat'],
  bees: ['honey'],
}
const MEAT_PRODUCTS = new Set(['meat'])
const COUNT_REASONS = ['slaughtered', 'sold', 'died', 'other']

// Prisma returns Decimal for farmLat/farmLng — convert to numbers
function serializeLivestock(unit: any) {
  return enforceContract(livestockResponseSchema, {
    ...unit,
    farmLat: unit.farmLat !== null ? Number(unit.farmLat) : null,
    farmLng: unit.farmLng !== null ? Number(unit.farmLng) : null,
  }, 'livestock')
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
    parseBody(createLivestockRequestSchema, req.body)
    await requireFarmStructure(userId, farmId)

    const { name, animalType, currentCount, acquisitionDate, farmLat, farmLng, notes, fieldId } = req.body

    // Placement pin is optional, but when present it must be real (NFR-4)
    if (farmLat != null) requireLat(farmLat, 'farmLat')
    if (farmLng != null) requireLng(farmLng, 'farmLng')
    if (fieldId != null) await requireCorral(farmId, fieldId)

    const unit = await prisma.livestockUnit.create({
      data: {
        farmId,
        fieldId: fieldId ?? null,
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

    const { name, animalType, currentCount, acquisitionDate, farmLat, farmLng, notes, fieldId } = req.body
    parseBody(updateLivestockRequestSchema, req.body)

    // Corral can be set, moved (pasture rotation), or cleared with null
    if (fieldId != null) await requireCorral(farmId, fieldId)

    // Placement pin can be updated or cleared (null); real values only (NFR-4)
    if (farmLat != null) requireLat(farmLat, 'farmLat')
    if (farmLng != null) requireLng(farmLng, 'farmLng')

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (animalType !== undefined) updateData.animalType = animalType
    if (currentCount !== undefined) updateData.currentCount = currentCount
    if (acquisitionDate !== undefined) updateData.acquisitionDate = new Date(acquisitionDate)
    if (farmLat !== undefined) updateData.farmLat = farmLat
    if (farmLng !== undefined) updateData.farmLng = farmLng
    if (notes !== undefined) updateData.notes = notes
    if (fieldId !== undefined) updateData.fieldId = fieldId

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
// POST /api/v1/farms/:farmId/livestock/:id/production
// Log production — the livestock parallel of a harvest check-off
// (operator+ work). Writes an operations-log entry and mirrors it into
// the unified production ledger (harvest_yields). Meat production is the
// herd ledger: headCount animals leave the herd atomically, with a reason.
// ─────────────────────────────────────────────────────────────────────
router.post('/:id/production', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Livestock unit')
    requireFields(req.body, ['productId', 'quantity', 'unit', 'date'])
    parseBody(productionRequestSchema, req.body)
    await requireFarmOwnership(userId, farmId)

    const unit = await prisma.livestockUnit.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!unit) throw Errors.notFound('Livestock unit')

    const { productId, quantity, unit: qtyUnit, date, notes, headCount, countReason, revenue } = req.body
    requireRevenue(revenue)
    requireQuantity(quantity)

    const validProducts = ANIMAL_PRODUCTS[unit.animalType] ?? []
    if (!validProducts.includes(productId)) {
      throw Errors.validation(
        `productId must be one of: ${validProducts.join(', ') || '(none for this animal)'}`
      )
    }
    if (typeof quantity !== 'number' || !(quantity > 0)) {
      throw Errors.validation('quantity must be a positive number')
    }

    const isMeat = MEAT_PRODUCTS.has(productId)
    if (isMeat) {
      if (!Number.isInteger(headCount) || headCount < 1) {
        throw Errors.validation('headCount (animals leaving the herd) is required for meat production')
      }
      if (headCount > unit.currentCount) {
        throw Errors.validation(
          `headCount exceeds the herd (${unit.currentCount} ${unit.animalType})`
        )
      }
      if (countReason !== undefined && !COUNT_REASONS.includes(countReason)) {
        throw Errors.validation(`countReason must be one of: ${COUNT_REASONS.join(', ')}`)
      }
    } else if (headCount !== undefined) {
      throw Errors.validation('headCount only applies to meat production')
    }

    const result = await prisma.$transaction(async (tx) => {
      const operation = await tx.operation.create({
        data: {
          farmId,
          livestockUnitId: unit.id,
          type: 'production_record',
          actualDate: new Date(date),
          quantity,
          unit: qtyUnit,
          notes: notes ?? null,
          countDelta: isMeat ? -headCount : null,
          countReason: isMeat ? (countReason ?? 'slaughtered') : null,
          performedByUserId: userId,
        },
      })
      await tx.harvestYield.create({
        data: {
          farmId,
          livestockUnitId: unit.id,
          productId,
          operationId: operation.id,
          quantity,
          unit: qtyUnit,
          revenue: revenue ?? null,
          harvestDate: new Date(date),
          notes: notes ?? null,
        },
      })
      const updatedUnit = isMeat
        ? await tx.livestockUnit.update({
            where: { id: unit.id },
            data: { currentCount: { decrement: headCount } },
          })
        : unit
      return { operation, currentCount: updatedUnit.currentCount }
    })

    res.status(201).json({
      success: true,
      data: {
        operationId: result.operation.id,
        productId,
        quantity,
        unit: qtyUnit,
        currentCount: result.currentCount,
      },
    })
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
    await requireFarmStructure(userId, farmId)

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