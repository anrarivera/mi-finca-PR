import { Router, Request, Response, NextFunction } from 'express'
import type { Prisma } from '@prisma/client'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import {
  requireFields, requireValidId, requireLat, requireLng, requireBoundaryBounds,
  requireNameLength, parseBody,
} from '../lib/validate'
import { requireFarmRole } from '../lib/farmAccess'
import {
  fieldResponseSchema, createFieldRequestSchema, updateFieldRequestSchema,
} from '../contracts/fieldContract'
import { enforceContract } from '../contracts/enforce'
import { knownRecipeVersionIds, markVersionsReferenced } from '../lib/recipes'
import {
  requireSavePayload, fieldSaveTransaction,
  insertRows, insertFreePlants, reconcilePlantingEvents,
} from '../lib/fieldSave'

const router = Router({ mergeParams: true })

// Reading fields is operator work (the map needs them); creating,
// redrawing, or deleting fields is farm structure and needs admin
// (SDD roles — operators are fenced out of whole-field saves).
const requireFarmOwnership = (userId: string, farmId: string) =>
  requireFarmRole(userId, farmId, 'operator')
const requireFarmStructure = (userId: string, farmId: string) =>
  requireFarmRole(userId, farmId, 'admin')

function toDateStr(val: any): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  return String(val).split('T')[0]
}

// Bounds-check every coordinate a field payload can carry (SRS NFR-4).
// Undefined pieces mean "not updating that part" and pass through.
function requireGeometryBounds(payload: {
  boundary?: unknown
  farmLat?: unknown
  farmLng?: unknown
  rows?: any[]
  freePlants?: any[]
}) {
  requireBoundaryBounds(payload.boundary, 'boundary')
  if (payload.farmLat !== undefined) requireLat(payload.farmLat, 'farmLat')
  if (payload.farmLng !== undefined) requireLng(payload.farmLng, 'farmLng')
  ;(payload.rows ?? []).forEach((row: any, i: number) => {
    requireLat(row?.startLat, `rows[${i}].startLat`)
    requireLng(row?.startLng, `rows[${i}].startLng`)
    requireLat(row?.endLat, `rows[${i}].endLat`)
    requireLng(row?.endLng, `rows[${i}].endLng`)
    ;(row?.plants ?? []).forEach((p: any, j: number) => {
      requireLat(p?.lat, `rows[${i}].plants[${j}].lat`)
      requireLng(p?.lng, `rows[${i}].plants[${j}].lng`)
    })
  })
  ;(payload.freePlants ?? []).forEach((p: any, i: number) => {
    requireLat(p?.lat, `freePlants[${i}].lat`)
    requireLng(p?.lng, `freePlants[${i}].lng`)
  })
}

// Ray-casting point-in-polygon for lat/lng coordinates
function pointInPolygonLatLng(
  pt: { lat: number; lng: number },
  polygon: Array<{ lat: number; lng: number }>
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat
    const xj = polygon[j].lng, yj = polygon[j].lat
    const intersect = yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Attach plant instances to their planting event. The client sends each
// event's rowIds/freePlantIds, but plants are created through row nesting
// without plantingEventId — without this link, serializeField returns empty
// rowIds/freePlantIds and the harvest row/plant selector has nothing to
// offer. Runs after rows/plants and events all exist, on the transaction
// of the save that wrote them.
async function linkPlantsToEvents(
  fieldId: string,
  events: any[],
  db: Prisma.TransactionClient = prisma
) {
  for (const event of events ?? []) {
    const rowIds: string[] = event.rowIds ?? []
    const freePlantIds: string[] = event.freePlantIds ?? []
    if (rowIds.length === 0 && freePlantIds.length === 0) continue
    await db.plantInstance.updateMany({
      where: {
        fieldId,
        OR: [
          ...(rowIds.length ? [{ rowId: { in: rowIds } }] : []),
          ...(freePlantIds.length ? [{ id: { in: freePlantIds } }] : []),
        ],
        // Companion rows belong to two events (one per crop) — scope the
        // link to the event's own crop so plants land in the right event.
        cropTypeId: event.cropTypeId,
      },
      data: { plantingEventId: event.id },
    })
  }
}

function validateFieldInsideFarm(
  fieldBoundary: Array<{ lat: number; lng: number }>,
  farmBoundary: Array<{ lat: number; lng: number }>
) {
  if (!farmBoundary || farmBoundary.length < 3) return // no farm boundary = no restriction
  if (!fieldBoundary || fieldBoundary.length < 3) return
  const allInside = fieldBoundary.every(pt => pointInPolygonLatLng(pt, farmBoundary))
  if (!allInside) {
    throw Errors.validation('El campo debe estar dentro del límite de la finca')
  }
}

// Coordinates ship at 6 decimals (~11 cm on the ground) — full double
// precision nearly doubles the JSON size of a plant for zero agronomic
// value, and a big field carries 10k+ of them.
const round6 = (n: unknown) => Math.round(Number(n) * 1e6) / 1e6

export function serializeField(field: any) {
  // Strip the raw Prisma relations before spreading: field.plants holds
  // EVERY plant (row plants included), and each event carries its own
  // plants + recommended — spreading them verbatim shipped every plant
  // up to three times. Only the nested rows/freePlants shapes go out.
  const { plants: fieldPlants, plantingEvents, ...rest } = field
  const built = {
    ...rest,
    farmLat: round6(field.farmLat),
    farmLng: round6(field.farmLng),
    boundary: Array.isArray(field.boundary)
      ? field.boundary.map((p: any) => ({ lat: round6(p.lat), lng: round6(p.lng) }))
      : field.boundary,
    rows: (field.rows ?? []).map((row: any) => ({
      ...row,
      startLat: round6(row.startLat),
      startLng: round6(row.startLng),
      endLat: round6(row.endLat),
      endLng: round6(row.endLng),
      spacingFt: Number(row.spacingFt),
      plantingDate: toDateStr(row.plantingDate),
      path: Array.isArray(row.path)
        ? row.path.map((p: any) => ({ lat: round6(p.lat), lng: round6(p.lng) }))
        : row.path,
      plants: (row.plants ?? []).map((p: any) => ({
        ...p,
        lat: round6(p.lat),
        lng: round6(p.lng),
        plantingDate: toDateStr(p.plantingDate),
      })),
    })),
    freePlants: (fieldPlants ?? [])
      .filter((p: any) => !p.rowId)
      .map((p: any) => ({
        ...p,
        lat: round6(p.lat),
        lng: round6(p.lng),
        plantingDate: toDateStr(p.plantingDate),
      })),
    plantingEvents: (plantingEvents ?? []).map((e: any) => {
      const { plants: eventPlants, recommended, ...event } = e
      return {
        ...event,
        plantingDate: toDateStr(e.plantingDate),
        rowIds: [...new Set(
          (eventPlants ?? [])
            .filter((p: any) => p.rowId)
            .map((p: any) => p.rowId as string)
        )],
        freePlantIds: (eventPlants ?? [])
          .filter((p: any) => !p.rowId)
          .map((p: any) => p.id as string),
        operations: (recommended ?? []).map((op: any) => ({
          ...op,
          recommendedDate: toDateStr(op.recommendedDate),
          completedDate: op.completedDate ? toDateStr(op.completedDate) : null,
          // Prisma Decimal serializes as a string — normalize to number.
          quantity: op.quantity !== null && op.quantity !== undefined ? Number(op.quantity) : null,
        })),
      }
    }),
  }

  // Contract enforcement: unknown keys stripped, drift logged, fail-soft.
  return enforceContract(fieldResponseSchema, built, 'field')
}

export const fieldInclude = {
  rows: {
    where: {},
    include: { plants: true },
    orderBy: { createdAt: 'asc' as const },
  },
  plants: true,
  plantingEvents: {
    include: {
      recommended: true,
      plants: true,
    },
  },
}

// GET /api/v1/farms/:farmId/fields
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    await requireFarmOwnership(userId, farmId)

    const fields = await prisma.field.findMany({
      where: { farmId, deletedAt: { equals: null } },
      include: fieldInclude,
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
    const farmId = req.params.farmId as string
    const userId = req.user!.userId
    const {
      name, color, shape, boundary, kind,
      farmLat, farmLng,
      displayMode, isPositioning, isSimulated, farmModelId,
      rows = [], freePlants = [], plantingEvents = [],
    } = req.body

    requireFields(req.body, ['name', 'color', 'shape', 'farmLat', 'farmLng'])
    requireNameLength(req.body?.name, 80)
    parseBody(createFieldRequestSchema, req.body)
    if (kind !== undefined && !['crops', 'livestock'].includes(kind)) {
      throw Errors.validation("kind must be 'crops' or 'livestock'")
    }
    requireGeometryBounds({ boundary, farmLat, farmLng, rows, freePlants })
    requireSavePayload({ rows, freePlants, plantingEvents })
    const { farm } = await requireFarmStructure(userId, farmId)

    // Validate field boundary is inside farm boundary
    validateFieldInsideFarm(
      boundary ?? [],
      (farm.boundary as Array<{ lat: number; lng: number }>) ?? []
    )

    // One transaction: a save that fails half-way leaves no orphan field.
    const field = await fieldSaveTransaction(async (tx) => {
      // Recipe references on plantings: keep only version ids that exist so
      // a stale/foreign id degrades to "no reference" instead of an FK 500.
      const knownVersions = await knownRecipeVersionIds(
        plantingEvents.map((e: any) => e.recipeVersionId), tx
      )

      // Step 1 — Create the field
      const newField = await tx.field.create({
        data: {
          farmId,
          name,
          kind: kind ?? 'crops',
          color,
          shape,
          boundary: boundary ?? [],
          farmLat,
          farmLng,
          displayMode: displayMode ?? 'shape',
          isPositioning: isPositioning ?? false,
          isSimulated: isSimulated ?? false,
          farmModelId: farmModelId ?? null,
        },
        select: { id: true },
      })

      // Step 2 — Create rows, plants and planting events now that we have
      // the field id
      await insertRows(tx, newField.id, rows)
      await insertFreePlants(tx, newField.id, freePlants)
      await reconcilePlantingEvents(tx, { id: newField.id, farmId }, plantingEvents, knownVersions)

      // Step 3 — Link plants to their planting events (rows now exist)
      await linkPlantsToEvents(newField.id, plantingEvents, tx)

      // R1: the first planting that stamps from a recipe version freezes it.
      await markVersionsReferenced(
        plantingEvents.map((e: any) => e.recipeVersionId).filter((v: any) => v && knownVersions.has(v)),
        tx
      )

      return newField
    })

    // Step 4 — Fetch and return complete field with all relations
    const created = await prisma.field.findFirst({
      where: { id: field.id },
      include: fieldInclude,
    })

    res.status(201).json({ success: true, data: { field: serializeField(created) } })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/v1/farms/:farmId/fields/:id
router.patch('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id)
    const { farm } = await requireFarmStructure(userId, farmId)

    const existing = await prisma.field.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!existing) throw Errors.notFound('Field')

    const {
      name, color, shape, boundary,
      farmLat, farmLng,
      displayMode, isPositioning, isSimulated, farmModelId,
      rows, freePlants, plantingEvents,
    } = req.body

    // The structural gate goes first: the guards below read into the
    // payload and would throw on a shape it has not vouched for.
    parseBody(updateFieldRequestSchema, req.body)
    requireGeometryBounds({ boundary, farmLat, farmLng, rows, freePlants })
    requireNameLength(req.body?.name, 80)
    requireSavePayload({ rows, freePlants, plantingEvents })

    // Validate field boundary is inside farm boundary
    if (boundary && boundary.length >= 3) {
      validateFieldInsideFarm(
        boundary,
        (farm.boundary as Array<{ lat: number; lng: number }>) ?? []
      )
    }

    // One transaction: a save that fails half-way leaves the field as it was.
    await fieldSaveTransaction(async (tx) => {
      // Update scalar fields
      await tx.field.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(color !== undefined && { color }),
          ...(shape !== undefined && { shape }),
          ...(boundary !== undefined && { boundary }),
          ...(farmLat !== undefined && { farmLat }),
          ...(farmLng !== undefined && { farmLng }),
          ...(displayMode !== undefined && { displayMode }),
          ...(isPositioning !== undefined && { isPositioning }),
          ...(isSimulated !== undefined && { isSimulated }),
          ...(farmModelId !== undefined && { farmModelId }),
        },
      })

      // Replace rows entirely if provided. Their plants go first, and only
      // theirs: free plants are replaced below, when the payload has them.
      if (rows !== undefined) {
        await tx.plantInstance.deleteMany({ where: { fieldId: id, rowId: { not: null } } })
        await tx.fieldRow.deleteMany({ where: { fieldId: id } })
        await insertRows(tx, id, rows)
      }

      // Replace free plants if provided
      if (freePlants !== undefined) {
        await tx.plantInstance.deleteMany({
          where: { fieldId: id, rowId: null },
        })
        await insertFreePlants(tx, id, freePlants)
      }

      // Reconcile planting events if provided — a field save owns which
      // plantings exist and their planned calendar, never the recorded work
      // (lib/fieldSave.ts).
      if (plantingEvents !== undefined) {
        // See POST: unknown recipe-version ids degrade to "no reference".
        const knownVersions = await knownRecipeVersionIds(
          plantingEvents.map((e: any) => e.recipeVersionId), tx
        )
        await reconcilePlantingEvents(tx, { id, farmId }, plantingEvents, knownVersions)

        // Re-link plants to events: the payload says which plants belong to
        // each planting it carries. Plants replaced above start unlinked;
        // the ones left in place still point at their planting, so clear
        // those links first.
        await tx.plantInstance.updateMany({
          where: { fieldId: id, plantingEventId: { in: plantingEvents.map((e: any) => e.id) } },
          data: { plantingEventId: null },
        })
        await linkPlantsToEvents(id, plantingEvents, tx)
        // R1: freeze the recipe versions these plantings stamped from.
        await markVersionsReferenced(plantingEvents.map((e: any) => e.recipeVersionId), tx)
      }
    })

    // Fetch and return updated field with all relations
    const updated = await prisma.field.findFirst({
      where: { id },
      include: fieldInclude,
    })

    res.json({ success: true, data: { field: serializeField(updated) } })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/farms/:farmId/fields/:id  (soft delete)
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id)
    await requireFarmStructure(userId, farmId)

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