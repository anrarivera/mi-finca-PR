import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId } from '../lib/validate'

const router = Router({ mergeParams: true })

async function requireFarmOwnership(userId: string, farmId: string) {
  const farm = await prisma.farm.findFirst({
    where: { id: farmId, userId, deletedAt: { equals: null } },
  })
  if (!farm) throw Errors.notFound('Farm')
  return farm
}

function toDateStr(val: any): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  return String(val).split('T')[0]
}

function serializeField(field: any) {
  return {
    ...field,
    widthFt: Number(field.widthFt),
    heightFt: Number(field.heightFt),
    farmLat: Number(field.farmLat),
    farmLng: Number(field.farmLng),
    rows: (field.rows ?? []).map((row: any) => ({
      ...row,
      startLat: Number(row.startLat),
      startLng: Number(row.startLng),
      endLat: Number(row.endLat),
      endLng: Number(row.endLng),
      spacingFt: Number(row.spacingFt),
      plantingDate: toDateStr(row.plantingDate),
      plants: (row.plants ?? []).map((p: any) => ({
        ...p,
        lat: Number(p.lat),
        lng: Number(p.lng),
        plantingDate: toDateStr(p.plantingDate),
      })),
    })),
    freePlants: (field.plants ?? [])
      .filter((p: any) => !p.rowId)
      .map((p: any) => ({
        ...p,
        lat: Number(p.lat),
        lng: Number(p.lng),
        plantingDate: toDateStr(p.plantingDate),
      })),
    plantingEvents: (field.plantingEvents ?? []).map((e: any) => ({
      ...e,
      plantingDate: toDateStr(e.plantingDate),
      // Derive rowIds from plants that belong to a row
      rowIds: [...new Set(
        (e.plants ?? [])
          .filter((p: any) => p.rowId)
          .map((p: any) => p.rowId as string)
      )],
      // Derive freePlantIds from plants without a row
      freePlantIds: (e.plants ?? [])
        .filter((p: any) => !p.rowId)
        .map((p: any) => p.id as string),
      operations: (e.recommended ?? []).map((op: any) => ({
        ...op,
        recommendedDate: toDateStr(op.recommendedDate),
        completedDate: op.completedDate ? toDateStr(op.completedDate) : null,
      })),
    })),
  }
}

// Include relations in all queries
const fieldInclude = {
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
      name, color, shape, boundary,
      widthFt, heightFt, farmLat, farmLng,
      displayMode, isPositioning, isSimulated, farmModelId,
      rows = [], freePlants = [], plantingEvents = [],
    } = req.body

    requireFields(req.body, ['name', 'color', 'shape', 'widthFt', 'heightFt', 'farmLat', 'farmLng'])
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
        rows: {
          create: rows.map((row: any) => ({
            id: row.id,
            startLat: row.startLat,
            startLng: row.startLng,
            endLat: row.endLat,
            endLng: row.endLng,
            spacingFt: row.spacingFt,
            primaryCropTypeId: row.primaryCropTypeId,
            companionCropTypeId: row.companionCropTypeId ?? null,
            plantingDate: new Date(row.plantingDate),
            plants: {
              create: (row.plants ?? []).map((p: any) => ({
                id: p.id,
                cropTypeId: p.cropTypeId,
                lat: p.lat,
                lng: p.lng,
                plantingDate: new Date(p.plantingDate),
              })),
            },
          })),
        },
        plants: {
          create: freePlants.map((p: any) => ({
            id: p.id,
            cropTypeId: p.cropTypeId,
            lat: p.lat,
            lng: p.lng,
            plantingDate: new Date(p.plantingDate),
          })),
        },
        plantingEvents: {
          create: plantingEvents.map((event: any) => ({
            id: event.id,
            cropTypeId: event.cropTypeId,
            plantingDate: new Date(event.plantingDate),
            plantCount: event.plantCount,
            isSimulated: event.isSimulated ?? false,
            recommended: {
              create: (event.operations ?? []).map((op: any) => ({
                id: op.id,
                templateId: op.templateId,
                type: op.type,
                labelEs: op.labelEs,
                recommendedDate: new Date(op.recommendedDate),
                status: op.status ?? 'pending',
                completedDate: op.completedDate ? new Date(op.completedDate) : null,
                notes: op.notes ?? null,
                product: op.product ?? null,
                quantity: op.quantity ?? null,
                unit: op.unit ?? null,
              })),
            },
          })),
        },
      },
      include: fieldInclude,
    })

    res.status(201).json({ success: true, data: { field: serializeField(field) } })
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
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.field.findFirst({
      where: { id, farmId, deletedAt: { equals: null } },
    })
    if (!existing) throw Errors.notFound('Field')

    const {
      name, color, shape, boundary,
      widthFt, heightFt, farmLat, farmLng,
      displayMode, isPositioning, isSimulated, farmModelId,
      rows, freePlants, plantingEvents,
    } = req.body

    // Update scalar fields
    await prisma.field.update({
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

    // Replace rows entirely if provided
    if (rows !== undefined) {
      await prisma.fieldRow.deleteMany({ where: { fieldId: id } })

      for (const row of rows) {
        await prisma.fieldRow.create({
          data: {
            id: row.id,
            fieldId: id,
            startLat: row.startLat,
            startLng: row.startLng,
            endLat: row.endLat,
            endLng: row.endLng,
            spacingFt: row.spacingFt,
            primaryCropTypeId: row.primaryCropTypeId,
            companionCropTypeId: row.companionCropTypeId ?? null,
            plantingDate: new Date(row.plantingDate),
            plants: {
              create: (row.plants ?? []).map((p: any) => ({
                id: p.id,
                field: { connect: { id } },
                cropTypeId: p.cropTypeId,
                lat: p.lat,
                lng: p.lng,
                plantingDate: new Date(p.plantingDate),
              })),
            },
          },
        })
      }
    }

    // Replace free plants if provided
    if (freePlants !== undefined) {
      await prisma.plantInstance.deleteMany({
        where: { fieldId: id, rowId: null },
      })
      for (const p of freePlants) {
        await prisma.plantInstance.create({
          data: {
            id: p.id,
            fieldId: id,
            rowId: null,
            cropTypeId: p.cropTypeId,
            lat: p.lat,
            lng: p.lng,
            plantingDate: new Date(p.plantingDate),
          },
        })
      }
    }

    // Replace planting events if provided
    if (plantingEvents !== undefined) {
      await prisma.plantingEvent.deleteMany({ where: { fieldId: id } })

      for (const event of plantingEvents) {
        await prisma.plantingEvent.create({
          data: {
            id: event.id,
            fieldId: id,
            cropTypeId: event.cropTypeId,
            plantingDate: new Date(event.plantingDate),
            plantCount: event.plantCount,
            isSimulated: event.isSimulated ?? false,
            recommended: {
              create: (event.operations ?? []).map((op: any) => ({
                id: op.id,
                templateId: op.templateId,
                type: op.type,
                labelEs: op.labelEs,
                recommendedDate: new Date(op.recommendedDate),
                status: op.status ?? 'pending',
                completedDate: op.completedDate ? new Date(op.completedDate) : null,
                notes: op.notes ?? null,
                product: op.product ?? null,
                quantity: op.quantity ?? null,
                unit: op.unit ?? null,
              })),
            },
          },
        })
      }
    }

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