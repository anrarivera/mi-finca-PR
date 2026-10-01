import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { Errors } from './errors'

// ── Field saves: the checks and writes behind POST/PATCH fields ─────────
// The governing rule: a field save owns STRUCTURE — which plantings exist,
// their plants, the planned calendar. The check-off endpoints (complete,
// skip, undo, partial logs, a finding's treatment labor) own check-off
// state. A field save never deletes or rewrites recorded work.
//
// The editor snapshots a field when it opens and sends that snapshot back
// wholesale on save, so anything a save rewrites is rewritten with data
// that may be hours old. And a save lands whole or not at all: everything
// is validated before the first write, and every write shares one
// transaction.

type Db = Prisma.TransactionClient

const STATUSES = ['pending', 'due', 'completed', 'skipped']
const OPEN_STATUSES = ['pending', 'due']
const isOpen = (status: unknown) => OPEN_STATUSES.includes(status as string)

// spacingFt is a Decimal(6,2) column.
const MAX_SPACING_FT = 9999.99

// ── Validation ──────────────────────────────────────────────────────────

function requireDate(value: unknown, context: string) {
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
    throw Errors.validation(`${context} must be a valid date`)
  }
}

function requireUnique(seen: Set<string>, id: string, context: string) {
  if (seen.has(id)) {
    throw Errors.validation(`${context} must be unique within the request`)
  }
  seen.add(id)
}

// Everything the structural gate (zod) lets through but the database
// would reject mid-save: unparseable dates, numbers that do not fit their
// column, ids repeated inside the payload. Undefined pieces mean "not
// updating that part" and pass through.
export function requireSavePayload(payload: {
  rows?: any[]
  freePlants?: any[]
  plantingEvents?: any[]
}) {
  const rowIds = new Set<string>()
  const plantIds = new Set<string>()
  const eventIds = new Set<string>()
  const operationIds = new Set<string>()

  const requirePlant = (plant: any, context: string) => {
    requireUnique(plantIds, plant.id, `${context}.id`)
    requireDate(plant.plantingDate, `${context}.plantingDate`)
  }

  ;(payload.rows ?? []).forEach((row: any, i: number) => {
    requireUnique(rowIds, row.id, `rows[${i}].id`)
    requireDate(row.plantingDate, `rows[${i}].plantingDate`)
    if (!Number.isFinite(row.spacingFt) || row.spacingFt <= 0 || row.spacingFt > MAX_SPACING_FT) {
      throw Errors.validation(
        `rows[${i}].spacingFt must be a number above 0 and no larger than ${MAX_SPACING_FT}`
      )
    }
    ;(row.plants ?? []).forEach((p: any, j: number) => {
      requirePlant(p, `rows[${i}].plants[${j}]`)
    })
  })
  ;(payload.freePlants ?? []).forEach((p: any, i: number) => {
    requirePlant(p, `freePlants[${i}]`)
  })
  ;(payload.plantingEvents ?? []).forEach((event: any, i: number) => {
    requireUnique(eventIds, event.id, `plantingEvents[${i}].id`)
    requireDate(event.plantingDate, `plantingEvents[${i}].plantingDate`)
    if (!Number.isInteger(event.plantCount) || event.plantCount < 0) {
      throw Errors.validation(`plantingEvents[${i}].plantCount must be a non-negative integer`)
    }
    ;(event.operations ?? []).forEach((op: any, j: number) => {
      const context = `plantingEvents[${i}].operations[${j}]`
      requireUnique(operationIds, op.id, `${context}.id`)
      requireDate(op.recommendedDate, `${context}.recommendedDate`)
      if (op.completedDate) requireDate(op.completedDate, `${context}.completedDate`)
      if (op.status !== undefined && !STATUSES.includes(op.status)) {
        throw Errors.validation(`${context}.status must be one of: ${STATUSES.join(', ')}`)
      }
    })
  })
}

// ── The transaction ─────────────────────────────────────────────────────

// Runs a save's writes as one transaction. Big fields carry 10k+ plants,
// far beyond what the 5 s default allows.
//
// Ids are client-generated, so a unique violation means one of them is
// already taken — in practice by another field: this field's own rows
// and plants are cleared, and its plantings matched by id, before
// anything is inserted. By the time it surfaces the transaction has
// rolled back: answer 409 instead of a 500.
export async function fieldSaveTransaction<T>(write: (tx: Db) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(write, { maxWait: 15_000, timeout: 120_000 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw Errors.conflict(
        'No se pudo guardar: el campo incluye una hilera, planta o siembra que ya está registrada'
      )
    }
    throw err
  }
}

// ── Rows and plants ─────────────────────────────────────────────────────

// One INSERT per thousand records instead of one per record.
const CHUNK_SIZE = 1000

async function insertChunked<T>(records: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    await insert(records.slice(i, i + CHUNK_SIZE))
  }
}

const plantData = (fieldId: string, rowId: string | null, p: any) => ({
  id: p.id,
  fieldId,
  rowId,
  cropTypeId: p.cropTypeId,
  lat: p.lat,
  lng: p.lng,
  plantingDate: new Date(p.plantingDate),
})

export async function insertFreePlants(tx: Db, fieldId: string, plants: any[]) {
  await insertChunked(
    plants.map((p: any) => plantData(fieldId, null, p)),
    data => tx.plantInstance.createMany({ data })
  )
}

export async function insertRows(tx: Db, fieldId: string, rows: any[]) {
  // Rows are read back ordered by createdAt, and a bulk insert would stamp
  // them all with the same instant — space them 1 ms apart so they keep
  // the order they were drawn in.
  const firstCreatedAt = Date.now()
  await insertChunked(
    rows.map((row: any, i: number) => ({
      id: row.id,
      fieldId,
      startLat: row.startLat,
      startLng: row.startLng,
      endLat: row.endLat,
      endLng: row.endLng,
      spacingFt: row.spacingFt,
      primaryCropTypeId: row.primaryCropTypeId,
      companionCropTypeId: row.companionCropTypeId ?? null,
      plantingDate: new Date(row.plantingDate),
      // Contour rows carry their drawn path; straight rows leave null.
      ...(Array.isArray(row.path) ? { path: row.path } : {}),
      ...(typeof row.pathClosed === 'boolean' ? { pathClosed: row.pathClosed } : {}),
      createdAt: new Date(firstCreatedAt + i),
    })),
    data => tx.fieldRow.createMany({ data })
  )
  await insertChunked(
    rows.flatMap((row: any) =>
      (row.plants ?? []).map((p: any) => plantData(fieldId, row.id, p))
    ),
    data => tx.plantInstance.createMany({ data })
  )
}

// ── Planting events ─────────────────────────────────────────────────────

// The only calendar entries a save may delete: plans nobody acted on and
// no finding points at. Stated in the WHERE clause rather than decided
// from the rows read earlier, so a check-off that lands while the save is
// running still wins.
const disposable = {
  status: { in: OPEN_STATUSES },
  treatedFindings: { none: {} },
}

// The columns whose value really differs — an untouched row is not
// rewritten, so a save that changes nothing writes nothing.
function changedColumns(stored: Record<string, unknown>, sent: Record<string, unknown>) {
  const same = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b
  return Object.fromEntries(
    Object.entries(sent).filter(([column, value]) => !same(stored[column], value))
  )
}

// Reconcile the field's plantings with the payload IN PLACE. Deleting and
// recreating them — even with the same ids — cascaded through the foreign
// keys: every logged operation lost its plantingEventId (and with it the
// yields a recipe counts as evidence), every finding lost its treatment
// labor, and the check-off columns were rewritten from the client's
// snapshot.
export async function reconcilePlantingEvents(
  tx: Db,
  field: { id: string; farmId: string },
  events: any[],
  knownVersions: Set<string>
) {
  const stored = await tx.plantingEvent.findMany({
    where: { fieldId: field.id },
    include: { recommended: true },
  })
  const storedEvents = new Map(stored.map(e => [e.id, e]))
  const versionRef = (id: unknown) =>
    typeof id === 'string' && knownVersions.has(id) ? id : null

  const newEvents = events.filter((e: any) => !storedEvents.has(e.id))
  const newOperations = events.flatMap((event: any) => {
    const known = new Set(storedEvents.get(event.id)?.recommended.map(r => r.id))
    return (event.operations ?? [])
      .filter((op: any) => !known.has(op.id))
      .map((op: any) => ({ ...op, plantingEventId: event.id as string }))
  })

  // An id that is new here must be new everywhere. One that already
  // exists belongs to another field's planting (or to another planting's
  // calendar), and those rows are not this save's to touch.
  if (newEvents.length > 0 && await tx.plantingEvent.findFirst({
    where: { id: { in: newEvents.map((e: any) => e.id) } },
    select: { id: true },
  })) {
    throw Errors.conflict('Una siembra de este campo ya está registrada en otro campo')
  }
  if (newOperations.length > 0 && await tx.recommendedOperation.findFirst({
    where: { id: { in: newOperations.map((op: any) => op.id) } },
    select: { id: true },
  })) {
    throw Errors.conflict('Una labor de este campo ya está registrada en otra siembra')
  }

  // Plantings the payload no longer carries lose their open plans. What
  // is left of each is its history: labors completed or skipped, the
  // treatment of a finding, logged operations pointing at it. A planting
  // with none of that is deleted; one with any of it stays — the client's
  // own "history-only event" rule (rebuildPlantingEvents).
  const sentIds = new Set(events.map((e: any) => e.id))
  const absentIds = stored.filter(e => !sentIds.has(e.id)).map(e => e.id)
  if (absentIds.length > 0) {
    await tx.recommendedOperation.deleteMany({
      where: { plantingEventId: { in: absentIds }, ...disposable },
    })
    await tx.plantingEvent.deleteMany({
      where: { id: { in: absentIds }, recommended: { none: {} }, operations: { none: {} } },
    })
  }

  for (const event of events) {
    const current = storedEvents.get(event.id)
    if (!current) continue

    const changes = changedColumns(current, {
      cropTypeId: event.cropTypeId,
      plantingDate: new Date(event.plantingDate),
      plantCount: event.plantCount,
      // Responses do not carry isSimulated, so clients cannot send it
      // back: absent means "unchanged", not false.
      ...(typeof event.isSimulated === 'boolean' && { isSimulated: event.isSimulated }),
      ...('recipeVersionId' in event && { recipeVersionId: versionRef(event.recipeVersionId) }),
    })
    if (Object.keys(changes).length > 0) {
      await tx.plantingEvent.update({ where: { id: current.id }, data: changes })
    }

    // No calendar in the payload means "not updating the calendar".
    if (!Array.isArray(event.operations)) continue
    const sent = new Map<string, any>(event.operations.map((op: any) => [op.id, op]))

    const dropped = current.recommended.filter(r => !sent.has(r.id)).map(r => r.id)
    if (dropped.length > 0) {
      await tx.recommendedOperation.deleteMany({
        where: { id: { in: dropped }, ...disposable },
      })
    }

    for (const recorded of current.recommended) {
      const op = sent.get(recorded.id)
      if (!op) continue
      // The plan is the save's to change. An open labor also takes its
      // product and the pending/due flip the client derives from today's
      // date. Everything else — completedDate, completedOperationId,
      // notes, quantity, unit, and the status of a labor already
      // completed or skipped — belongs to the check-off endpoints.
      const open = isOpen(recorded.status)
      const plan = changedColumns(recorded, {
        templateId: op.templateId,
        type: op.type,
        labelEs: op.labelEs,
        recommendedDate: new Date(op.recommendedDate),
        ...(open && { product: op.product ?? null }),
        ...(open && isOpen(op.status) && { status: op.status }),
      })
      if (Object.keys(plan).length === 0) continue
      await tx.recommendedOperation.updateMany({
        where: { id: recorded.id, ...(open && { status: { in: OPEN_STATUSES } }) },
        data: plan,
      })
    }
  }

  await insertChunked(
    newEvents.map((event: any) => ({
      id: event.id,
      fieldId: field.id,
      cropTypeId: event.cropTypeId,
      plantingDate: new Date(event.plantingDate),
      plantCount: event.plantCount,
      isSimulated: event.isSimulated ?? false,
      recipeVersionId: versionRef(event.recipeVersionId),
    })),
    data => tx.plantingEvent.createMany({ data })
  )

  // A recommendation born in this save keeps the check-off columns the
  // client sent, except the link to the operations log: that one only
  // when the entry exists on this farm.
  const claimed = newOperations
    .map((op: any) => op.completedOperationId)
    .filter((id: unknown): id is string => typeof id === 'string')
  const ownOperations = claimed.length === 0
    ? []
    : await tx.operation.findMany({
        where: { id: { in: claimed }, farmId: field.farmId },
        select: { id: true },
      })
  const ownOperationIds = new Set(ownOperations.map(o => o.id))

  await insertChunked(
    newOperations.map((op: any) => ({
      id: op.id,
      plantingEventId: op.plantingEventId,
      templateId: op.templateId,
      type: op.type,
      labelEs: op.labelEs,
      recommendedDate: new Date(op.recommendedDate),
      status: op.status ?? 'pending',
      completedDate: op.completedDate ? new Date(op.completedDate) : null,
      completedOperationId: ownOperationIds.has(op.completedOperationId)
        ? op.completedOperationId
        : null,
      notes: op.notes ?? null,
      product: op.product ?? null,
      quantity: op.quantity ?? null,
      unit: op.unit ?? null,
    })),
    data => tx.recommendedOperation.createMany({ data })
  )
}
