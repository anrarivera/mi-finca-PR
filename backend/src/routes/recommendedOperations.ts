import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'

// ──────────────────────────────────────────────────────────────────────────
// Recommended operations — SDD §4.6. These are the calendar entries the
// rule engine generates from crop schedules (and, later, livestock
// schedules). The rows themselves are created when a field is saved
// (routes/fields.ts); this router reads them and drives the two status
// transitions the UI needs: complete (check-off, SDD §6.2) and skip.
// Mounted at /api/v1/farms/:farmId/recommended-operations
// ──────────────────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true })

router.use(requireAuth)

// Helper: verify farm belongs to requesting user.
async function requireFarmOwnership(userId: string, farmId: string) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, userId, deletedAt: { equals: null } },
  })
  if (!farm) throw Errors.notFound('Farm')
  return farm
}

// A recommended operation belongs to a farm through EITHER its planting
// event's field OR its livestock unit — this OR-clause scopes every query.
function ownedByFarm(farmId: string) {
  return {
    OR: [
      { plantingEvent: { field: { farmId, deletedAt: { equals: null } } } },
      { livestockUnit: { farmId, deletedAt: { equals: null } } },
    ],
  }
}

function toDateStr(val: any): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  return String(val).split('T')[0]
}

function serializeRecOp(op: any) {
  return {
    ...op,
    quantity: op.quantity !== null && op.quantity !== undefined ? Number(op.quantity) : null,
    recommendedDate: toDateStr(op.recommendedDate),
    completedDate: op.completedDate ? toDateStr(op.completedDate) : null,
  }
}

// Today at UTC midnight — recommendedDate is a @db.Date column (stored at
// midnight UTC), so comparisons must use the same anchor.
function todayUtc(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// The open status a recommendation should carry given its date: past-due
// items reopen as 'due', future ones as 'pending'. Used by undo/unskip.
function openStatusFor(recommendedDate: Date): 'due' | 'pending' {
  return recommendedDate < todayUtc() ? 'due' : 'pending'
}

// Context included with every listing so the UI can label entries without a
// second round-trip (field + crop for crop ops, unit name for livestock ops).
const recOpInclude = {
  plantingEvent: {
    select: { id: true, fieldId: true, cropTypeId: true, plantingDate: true },
  },
  livestockUnit: { select: { id: true, name: true, animalType: true } },
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/recommended-operations
// All recommended operations for the farm, filterable: ?status=pending
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    await requireFarmOwnership(userId, farmId)

    const { status } = req.query
    const validStatuses = ['pending', 'due', 'completed', 'skipped']
    if (status && !validStatuses.includes(String(status))) {
      throw Errors.validation(`status must be one of: ${validStatuses.join(', ')}`)
    }

    const ops = await prisma.recommendedOperation.findMany({
      where: {
        ...ownedByFarm(farmId),
        ...(status ? { status: String(status) } : {}),
      },
      include: recOpInclude,
      orderBy: { recommendedDate: 'asc' },
    })

    res.json({ success: true, data: ops.map(serializeRecOp) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/recommended-operations/due-soon
// Operations due within the next 14 days plus anything overdue — feeds
// the notification badges (SDD §4.6). Registered before /:id routes.
// ─────────────────────────────────────────────────────────────────────
router.get('/due-soon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    await requireFarmOwnership(userId, farmId)

    const today = todayUtc()
    const horizon = new Date(today)
    horizon.setUTCDate(horizon.getUTCDate() + 14)

    const ops = await prisma.recommendedOperation.findMany({
      where: {
        ...ownedByFarm(farmId),
        status: { in: ['pending', 'due'] }, // completed/skipped never badge
        recommendedDate: { lte: horizon },
      },
      include: recOpInclude,
      orderBy: { recommendedDate: 'asc' },
    })

    // Split for the badge counts: overdue = past date, dueSoon = inside the
    // 14-day window. The client shows both numbers.
    const overdue = ops.filter(o => o.recommendedDate < today)
    const dueSoon = ops.filter(o => o.recommendedDate >= today)

    res.json({
      success: true,
      data: {
        overdueCount: overdue.length,
        dueSoonCount: dueSoon.length,
        operations: ops.map(serializeRecOp),
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/recommended-operations/:id/complete
// Check off a recommendation (SDD §6.2): creates the real operations log
// entry and marks the recommendation completed, atomically. Body accepts
// the check-off modal fields: completedDate (default today), product,
// quantity, unit, notes.
// ─────────────────────────────────────────────────────────────────────
router.post('/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    // NOTE: recommended-operation ids are client-generated strings
    // ("op_<eventId>_<templateId>", see frontend plantingEventManager.ts),
    // not UUIDs — so no UUID-shape check here, just a sanity bound.
    if (!id || id.length > 300) throw Errors.notFound('Recommended operation')
    await requireFarmOwnership(userId, farmId)

    const recOp = await prisma.recommendedOperation.findFirst({
      where: { id, ...ownedByFarm(farmId) },
      include: { plantingEvent: { select: { fieldId: true, cropTypeId: true } } },
    })
    if (!recOp) throw Errors.notFound('Recommended operation')
    if (recOp.status === 'completed') {
      throw Errors.conflict('This operation has already been completed')
    }

    const {
      completedDate, product, quantity, unit, notes, rowIds, plantIds,
    } = req.body ?? {}
    const actualDate = new Date(completedDate ?? todayUtc())

    if (rowIds !== undefined &&
        (!Array.isArray(rowIds) || rowIds.some((r: unknown) => typeof r !== 'string'))) {
      throw Errors.validation('rowIds must be an array of row ids')
    }
    if (plantIds !== undefined &&
        (!Array.isArray(plantIds) || plantIds.some((p: unknown) => typeof p !== 'string'))) {
      throw Errors.validation('plantIds must be an array of plant ids')
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. The real log entry — this is what the farmer "did".
      const operation = await tx.operation.create({
        data: {
          farmId,
          fieldId: recOp.plantingEvent?.fieldId ?? null,
          plantingEventId: recOp.plantingEventId,
          livestockUnitId: recOp.livestockUnitId,
          recommendedOperationId: recOp.id,
          type: recOp.type,
          actualDate,
          notes: notes ?? null,
          product: product ?? recOp.product ?? null,
          quantity: quantity ?? null,
          unit: unit ?? null,
          rowIds: rowIds ?? [],     // fully covered rows
          plantIds: plantIds ?? [], // extra individual plants (partial rows, loose plants)
        },
      })

      // 2. Flip the recommendation and link it to the log entry.
      const updated = await tx.recommendedOperation.update({
        where: { id: recOp.id },
        data: {
          status: 'completed',
          completedDate: actualDate,
          completedOperationId: operation.id,
          ...(product !== undefined && { product }),
          ...(quantity !== undefined && { quantity }),
          ...(unit !== undefined && { unit }),
          ...(notes !== undefined && { notes }),
        },
      })

      // 3. Harvest check-offs also become yield records so reports and the
      //    simulator can consume real production numbers.
      if (recOp.type === 'harvest' && quantity !== undefined && quantity !== null &&
          recOp.plantingEvent?.cropTypeId) {
        await tx.harvestYield.create({
          data: {
            farmId,
            fieldId: recOp.plantingEvent.fieldId,
            operationId: operation.id, // keeps the yield in sync with edits/undo
            cropTypeId: recOp.plantingEvent.cropTypeId,
            quantity,
            unit: unit ?? 'lb',
            harvestDate: actualDate,
            notes: notes ?? null,
          },
        })
      }

      return { operation, recommendedOperation: updated }
    })

    res.status(201).json({
      success: true,
      data: {
        operation: {
          ...result.operation,
          quantity: result.operation.quantity !== null ? Number(result.operation.quantity) : null,
          actualDate: toDateStr(result.operation.actualDate),
        },
        recommendedOperation: serializeRecOp(result.recommendedOperation),
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/recommended-operations/:id/log-partial
// Log progress against a recommendation WITHOUT completing it — the
// multi-day-harvest case: a field too big to harvest in one day gets one
// partial log per day, each with its own date/quantity, and the calendar
// item stays open until the farmer completes it on the final day.
// Creates an operations-log entry (linked via recommendedOperationId but
// NOT completedOperationId) and, for harvests with a quantity, a yield
// record. Works for any open recommendation, not just harvests.
// ─────────────────────────────────────────────────────────────────────
router.post('/:id/log-partial', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    if (!id || id.length > 300) throw Errors.notFound('Recommended operation')
    await requireFarmOwnership(userId, farmId)

    const recOp = await prisma.recommendedOperation.findFirst({
      where: { id, ...ownedByFarm(farmId) },
      include: { plantingEvent: { select: { fieldId: true, cropTypeId: true } } },
    })
    if (!recOp) throw Errors.notFound('Recommended operation')
    if (recOp.status === 'completed' || recOp.status === 'skipped') {
      throw Errors.conflict('Only open operations can receive partial logs')
    }

    const { date, product, quantity, unit, notes, rowIds, plantIds } = req.body ?? {}
    const actualDate = new Date(date ?? todayUtc())

    if (rowIds !== undefined &&
        (!Array.isArray(rowIds) || rowIds.some((r: unknown) => typeof r !== 'string'))) {
      throw Errors.validation('rowIds must be an array of row ids')
    }
    if (plantIds !== undefined &&
        (!Array.isArray(plantIds) || plantIds.some((p: unknown) => typeof p !== 'string'))) {
      throw Errors.validation('plantIds must be an array of plant ids')
    }

    const operation = await prisma.$transaction(async (tx) => {
      const created = await tx.operation.create({
        data: {
          farmId,
          fieldId: recOp.plantingEvent?.fieldId ?? null,
          plantingEventId: recOp.plantingEventId,
          livestockUnitId: recOp.livestockUnitId,
          recommendedOperationId: recOp.id, // linked, but the rec op stays open
          type: recOp.type,
          actualDate,
          notes: notes ?? null,
          product: product ?? null,
          quantity: quantity ?? null,
          unit: unit ?? null,
          rowIds: rowIds ?? [],     // e.g. "today I harvested rows 1–3"
          plantIds: plantIds ?? [], // "...plus the first 5 plants of row 4"
        },
      })

      if (recOp.type === 'harvest' && quantity !== undefined && quantity !== null &&
          recOp.plantingEvent?.cropTypeId) {
        await tx.harvestYield.create({
          data: {
            farmId,
            fieldId: recOp.plantingEvent.fieldId,
            operationId: created.id,
            cropTypeId: recOp.plantingEvent.cropTypeId,
            quantity,
            unit: unit ?? 'lb',
            harvestDate: actualDate,
            notes: notes ?? null,
          },
        })
      }

      return created
    })

    res.status(201).json({
      success: true,
      data: {
        ...operation,
        quantity: operation.quantity !== null ? Number(operation.quantity) : null,
        actualDate: toDateStr(operation.actualDate),
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/recommended-operations/:id/undo
// Reopen a recommendation:
//  - skipped  → back to pending/due (by date)
//  - completed → deletes the completing operations-log entry and its
//    harvest yield, then reopens. Partial logs are NOT touched — undoing
//    the final check-off of a 3-day harvest keeps days 1–2 on the books.
// ─────────────────────────────────────────────────────────────────────
router.post('/:id/undo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    if (!id || id.length > 300) throw Errors.notFound('Recommended operation')
    await requireFarmOwnership(userId, farmId)

    const recOp = await prisma.recommendedOperation.findFirst({
      where: { id, ...ownedByFarm(farmId) },
    })
    if (!recOp) throw Errors.notFound('Recommended operation')
    if (recOp.status !== 'completed' && recOp.status !== 'skipped') {
      throw Errors.conflict('Only completed or skipped operations can be undone')
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (recOp.completedOperationId) {
        // Remove the yield the check-off created, then the log entry itself.
        await tx.harvestYield.updateMany({
          where: { operationId: recOp.completedOperationId, deletedAt: null },
          data: { deletedAt: new Date() },
        })
        await tx.operation.deleteMany({ where: { id: recOp.completedOperationId } })
      }
      return tx.recommendedOperation.update({
        where: { id: recOp.id },
        data: {
          status: openStatusFor(recOp.recommendedDate),
          completedDate: null,
          completedOperationId: null,
        },
      })
    })

    res.json({ success: true, data: serializeRecOp(updated) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/recommended-operations/:id/skip
// Skip a recommendation — it stays in the calendar greyed out, and no
// operations log entry is created.
// ─────────────────────────────────────────────────────────────────────
router.post('/:id/skip', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    // NOTE: recommended-operation ids are client-generated strings
    // ("op_<eventId>_<templateId>", see frontend plantingEventManager.ts),
    // not UUIDs — so no UUID-shape check here, just a sanity bound.
    if (!id || id.length > 300) throw Errors.notFound('Recommended operation')
    await requireFarmOwnership(userId, farmId)

    const recOp = await prisma.recommendedOperation.findFirst({
      where: { id, ...ownedByFarm(farmId) },
    })
    if (!recOp) throw Errors.notFound('Recommended operation')
    if (recOp.status === 'completed') {
      throw Errors.conflict('A completed operation cannot be skipped')
    }

    const updated = await prisma.recommendedOperation.update({
      where: { id },
      data: { status: 'skipped' },
    })

    res.json({ success: true, data: serializeRecOp(updated) })
  } catch (err) {
    next(err)
  }
})

export default router
