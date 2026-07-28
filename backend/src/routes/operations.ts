import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId } from '../lib/validate'

// ──────────────────────────────────────────────────────────────────────────
// Operations log — SDD §4.5 / §6.2. An Operation is something that actually
// happened on the farm (fertilized, sprayed, harvested…). It can stand alone
// or confirm a RecommendedOperation, in which case the recommendation is
// flipped to `completed` and linked back via completedOperationId.
// Mounted at /api/v1/farms/:farmId/operations
// ──────────────────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true })

router.use(requireAuth)

// Operation types accepted by the API. Union of the SDD §3.2.8 enum and the
// types the frontend crop schedules emit ('spray', 'monitoring'). Stored as a
// plain string column, so this list is the single validation point.
const VALID_OPERATION_TYPES = [
  'planting', 'fertilization', 'spraying', 'spray', 'cultivation',
  'irrigation', 'flowering', 'monitoring', 'harvest', 'feeding',
  'health_treatment', 'breeding', 'production_record', 'other',
]

// Helper: verify farm belongs to requesting user (same pattern as the other
// per-farm routers — fields.ts, livestock.ts).
async function requireFarmOwnership(userId: string, farmId: string) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, userId, deletedAt: { equals: null } },
  })
  if (!farm) throw Errors.notFound('Farm')
  return farm
}

// Dates come back from Prisma as Date objects — API contract is YYYY-MM-DD.
function toDateStr(val: any): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  return String(val).split('T')[0]
}

// Prisma Decimal → number, Date → date string.
function serializeOperation(op: any) {
  return {
    ...op,
    quantity: op.quantity !== null && op.quantity !== undefined ? Number(op.quantity) : null,
    actualDate: toDateStr(op.actualDate),
  }
}

// Shared logic for confirming a recommendation: verifies the recommended
// operation belongs to this farm (through its planting event's field OR its
// livestock unit), then returns it. Used by POST / when the body carries a
// recommendedOperationId.
async function findOwnedRecommendedOp(farmId: string, recOpId: string) {
  return prisma.recommendedOperation.findFirst({
    where: {
      id: recOpId,
      OR: [
        { plantingEvent: { field: { farmId, deletedAt: { equals: null } } } },
        { livestockUnit: { farmId, deletedAt: { equals: null } } },
      ],
    },
    include: { plantingEvent: { select: { fieldId: true, cropTypeId: true } } },
  })
}

// If a completed operation is a harvest with a quantity, mirror it into the
// harvest_yields table so yield reports don't have to re-derive it from the
// operations log (SDD §3 — harvest data feeds financial projections).
async function maybeCreateHarvestYield(
  tx: any,
  farmId: string,
  op: { id: string; fieldId: string | null; type: string; actualDate: Date; quantity: any; unit: string | null; notes: string | null },
  cropTypeId: string | null
) {
  if (op.type !== 'harvest') return
  if (op.quantity === null || op.quantity === undefined) return
  if (!cropTypeId) return // can't attribute the yield to a crop — skip silently
  await tx.harvestYield.create({
    data: {
      farmId,
      fieldId: op.fieldId,
      operationId: op.id, // link back so edits/deletes of the log stay in sync
      cropTypeId,
      quantity: op.quantity,
      unit: op.unit ?? 'lb',
      harvestDate: op.actualDate,
      notes: op.notes,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/operations
// List operations for a farm. Filterable per SDD §4.5:
//   ?type=harvest&fieldId=<uuid>&livestockUnitId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    await requireFarmOwnership(userId, farmId)

    const { type, fieldId, livestockUnitId, from, to } = req.query

    const operations = await prisma.operation.findMany({
      where: {
        farmId,
        ...(type ? { type: String(type) } : {}),
        ...(fieldId ? { fieldId: String(fieldId) } : {}),
        ...(livestockUnitId ? { livestockUnitId: String(livestockUnitId) } : {}),
        ...(from || to
          ? {
              actualDate: {
                ...(from ? { gte: new Date(String(from)) } : {}),
                ...(to ? { lte: new Date(String(to)) } : {}),
              },
            }
          : {}),
      },
      orderBy: { actualDate: 'desc' },
    })

    res.json({ success: true, data: operations.map(serializeOperation) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/operations/export
// Export the operations log as CSV (SDD §4.5). PDF export is Phase 2.
// Registered before /:id so "export" is not captured as an id param.
// ─────────────────────────────────────────────────────────────────────
router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    const farm = await requireFarmOwnership(userId, farmId)

    const format = String(req.query.format ?? 'csv').toLowerCase()
    if (format !== 'csv') {
      throw Errors.validation('Only CSV export is supported in Phase 1 (format=csv)')
    }

    const operations = await prisma.operation.findMany({
      where: { farmId },
      include: {
        field: { select: { name: true } },
        livestockUnit: { select: { name: true } },
      },
      orderBy: { actualDate: 'desc' },
    })

    // Minimal CSV escaping: wrap in quotes, double any embedded quotes.
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }

    const header = 'date,type,field,livestock_unit,product,quantity,unit,quality_rating,rows_covered,plants_covered,notes'
    const rows = operations.map(op =>
      [
        toDateStr(op.actualDate),
        op.type,
        op.field?.name ?? '',
        op.livestockUnit?.name ?? '',
        op.product ?? '',
        op.quantity !== null ? Number(op.quantity) : '',
        op.unit ?? '',
        op.qualityRating ?? '',
        Array.isArray(op.rowIds) ? (op.rowIds as unknown[]).length || '' : '',
        Array.isArray(op.plantIds) ? (op.plantIds as unknown[]).length || '' : '',
        op.notes ?? '',
      ].map(esc).join(',')
    )

    const filename = `operaciones-${farm.name.replace(/[^\w\-]+/g, '_')}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send([header, ...rows].join('\n'))
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/operations
// Log a new operation (SDD §4.10 example shape). If the body carries a
// recommendedOperationId this is a "check-off" (SDD §6.2): the linked
// recommendation is marked completed atomically with the log entry.
// ─────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    requireFields(req.body, ['type', 'actualDate'])
    await requireFarmOwnership(userId, farmId)

    const {
      fieldId, plantingEventId, livestockUnitId, recommendedOperationId,
      type, actualDate, notes, product, quantity, unit, qualityRating,
      cropTypeId, // optional — lets a standalone harvest log attribute its yield
      rowIds,     // optional — fully covered field rows
      plantIds,   // optional — individually covered plants outside those rows
    } = req.body

    if (rowIds !== undefined &&
        (!Array.isArray(rowIds) || rowIds.some((r: unknown) => typeof r !== 'string'))) {
      throw Errors.validation('rowIds must be an array of row ids')
    }
    if (plantIds !== undefined &&
        (!Array.isArray(plantIds) || plantIds.some((p: unknown) => typeof p !== 'string'))) {
      throw Errors.validation('plantIds must be an array of plant ids')
    }

    if (!VALID_OPERATION_TYPES.includes(type)) {
      throw Errors.validation(`type must be one of: ${VALID_OPERATION_TYPES.join(', ')}`)
    }
    if (qualityRating !== undefined && qualityRating !== null &&
        (typeof qualityRating !== 'number' || qualityRating < 1 || qualityRating > 5)) {
      throw Errors.validation('qualityRating must be an integer between 1 and 5')
    }

    // Every referenced resource must belong to this farm — data isolation
    // is enforced per SDD §10.1, never trusted from the client.
    if (fieldId) {
      const field = await prisma.field.findFirst({
        where: { id: fieldId, farmId, deletedAt: { equals: null } },
      })
      if (!field) throw Errors.notFound('Field')
    }
    if (livestockUnitId) {
      const unitRow = await prisma.livestockUnit.findFirst({
        where: { id: livestockUnitId, farmId, deletedAt: { equals: null } },
      })
      if (!unitRow) throw Errors.notFound('Livestock unit')
    }
    if (plantingEventId) {
      const event = await prisma.plantingEvent.findFirst({
        where: { id: plantingEventId, field: { farmId } },
      })
      if (!event) throw Errors.notFound('Planting event')
    }

    let recOp = null
    if (recommendedOperationId) {
      recOp = await findOwnedRecommendedOp(farmId, recommendedOperationId)
      if (!recOp) throw Errors.notFound('Recommended operation')
    }

    // Create the operation and (when confirming a recommendation) update the
    // recommendation in one transaction so the two can never drift apart.
    const operation = await prisma.$transaction(async (tx) => {
      const created = await tx.operation.create({
        data: {
          farmId,
          fieldId: fieldId ?? recOp?.plantingEvent?.fieldId ?? null,
          plantingEventId: plantingEventId ?? recOp?.plantingEventId ?? null,
          livestockUnitId: livestockUnitId ?? recOp?.livestockUnitId ?? null,
          recommendedOperationId: recommendedOperationId ?? null,
          type,
          actualDate: new Date(actualDate),
          notes: notes ?? null,
          product: product ?? null,
          quantity: quantity ?? null,
          unit: unit ?? null,
          qualityRating: qualityRating ?? null,
          rowIds: rowIds ?? [],
          plantIds: plantIds ?? [],
        },
      })

      if (recOp) {
        await tx.recommendedOperation.update({
          where: { id: recOp.id },
          data: {
            status: 'completed',
            completedDate: new Date(actualDate),
            completedOperationId: created.id,
            // Carry what the farmer actually used onto the recommendation so
            // the calendar shows real products/quantities, not templates.
            ...(product !== undefined && { product }),
            ...(quantity !== undefined && { quantity }),
            ...(unit !== undefined && { unit }),
            ...(notes !== undefined && { notes }),
          },
        })
      }

      // Harvest check-offs double as yield records.
      await maybeCreateHarvestYield(
        tx, farmId, created,
        recOp?.plantingEvent?.cropTypeId ?? cropTypeId ?? null
      )

      return created
    })

    res.status(201).json({ success: true, data: serializeOperation(operation) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// PATCH /api/v1/farms/:farmId/operations/:id
// Edit an operation. Edits are tracked implicitly via updatedAt.
// ─────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Operation')
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.operation.findFirst({ where: { id, farmId } })
    if (!existing) throw Errors.notFound('Operation')

    const {
      type, actualDate, notes, product, quantity, unit, qualityRating,
      rowIds, plantIds,
    } = req.body

    if (type !== undefined && !VALID_OPERATION_TYPES.includes(type)) {
      throw Errors.validation(`type must be one of: ${VALID_OPERATION_TYPES.join(', ')}`)
    }
    if (rowIds !== undefined &&
        (!Array.isArray(rowIds) || rowIds.some((r: unknown) => typeof r !== 'string'))) {
      throw Errors.validation('rowIds must be an array of row ids')
    }
    if (plantIds !== undefined &&
        (!Array.isArray(plantIds) || plantIds.some((p: unknown) => typeof p !== 'string'))) {
      throw Errors.validation('plantIds must be an array of plant ids')
    }
    if (qualityRating !== undefined && qualityRating !== null &&
        (typeof qualityRating !== 'number' || qualityRating < 1 || qualityRating > 5)) {
      throw Errors.validation('qualityRating must be an integer between 1 and 5')
    }

    // Update the log entry and keep its derived records honest: the linked
    // harvest yield mirrors quantity/unit/date/notes, and if this entry is
    // the one that completed a recommendation, the recommendation's mirrored
    // fields follow too (so the calendar shows the corrected values).
    const updated = await prisma.$transaction(async (tx) => {
      const op = await tx.operation.update({
        where: { id },
        data: {
          ...(type !== undefined && { type }),
          ...(actualDate !== undefined && { actualDate: new Date(actualDate) }),
          ...(notes !== undefined && { notes }),
          ...(product !== undefined && { product }),
          ...(quantity !== undefined && { quantity }),
          ...(unit !== undefined && { unit }),
          ...(qualityRating !== undefined && { qualityRating }),
          ...(rowIds !== undefined && { rowIds }),
          ...(plantIds !== undefined && { plantIds }),
        },
      })

      await tx.harvestYield.updateMany({
        where: { operationId: id, deletedAt: null },
        data: {
          ...(actualDate !== undefined && { harvestDate: new Date(actualDate) }),
          ...(quantity !== undefined && quantity !== null && { quantity }),
          ...(unit !== undefined && unit !== null && { unit }),
          ...(notes !== undefined && { notes }),
        },
      })

      await tx.recommendedOperation.updateMany({
        where: { completedOperationId: id },
        data: {
          ...(actualDate !== undefined && { completedDate: new Date(actualDate) }),
          ...(product !== undefined && { product }),
          ...(quantity !== undefined && { quantity }),
          ...(unit !== undefined && { unit }),
          ...(notes !== undefined && { notes }),
        },
      })

      return op
    })

    res.json({ success: true, data: serializeOperation(updated) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/v1/farms/:farmId/operations/:id
// Hard delete (operations have no deletedAt column). If this log entry was
// confirming a recommendation, the recommendation reverts to pending so the
// calendar stays truthful.
// ─────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Operation')
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.operation.findFirst({ where: { id, farmId } })
    if (!existing) throw Errors.notFound('Operation')

    await prisma.$transaction(async (tx) => {
      // Un-complete any recommendation that pointed at this log entry. The
      // status goes back to due (not just pending) when its date has passed,
      // so the calendar immediately shows it as outstanding again.
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const linked = await tx.recommendedOperation.findMany({
        where: { completedOperationId: id },
        select: { id: true, recommendedDate: true },
      })
      for (const rec of linked) {
        await tx.recommendedOperation.update({
          where: { id: rec.id },
          data: {
            status: rec.recommendedDate < today ? 'due' : 'pending',
            completedDate: null,
            completedOperationId: null,
          },
        })
      }
      // The yield this log entry produced goes with it (soft delete).
      await tx.harvestYield.updateMany({
        where: { operationId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      await tx.operation.delete({ where: { id } })
    })

    res.json({ success: true, data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router
