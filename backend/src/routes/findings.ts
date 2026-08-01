import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { Errors } from '../lib/errors'
import { requireFields, requireValidId } from '../lib/validate'
import { requireFarmRole } from '../lib/farmAccess'

// ──────────────────────────────────────────────────────────────────────────
// Scouting findings — pest/disease observations tied to a field, with the
// same tri-level scope as operations (rowIds = fully affected rows,
// plantIds = individual plants, both empty = field-level observation).
// Findings record what the farmer SAW; the operations log records what the
// farmer DID. The only bridge is /:id/create-operation, which turns a
// finding into ONE coarse treatment labor in the recommendation calendar.
// Mounted at /api/v1/farms/:farmId/findings
// ──────────────────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true })

router.use(requireAuth)

const FINDING_STATUSES = ['open', 'treated', 'resolved']
const TREATMENT_TYPES = ['spray', 'cultivation', 'fertilization', 'monitoring']

// Activity router — operators and up (SDD roles: registering hallazgos y
// seguimientos is operator work).
const requireFarmOwnership = (userId: string, farmId: string) =>
  requireFarmRole(userId, farmId, 'operator')

// A finding belongs to a farm through its field.
function ownedByFarm(farmId: string) {
  return { field: { farmId, deletedAt: { equals: null } } }
}

function toDateStr(val: any): string {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  return String(val).split('T')[0]
}

function serializeFinding(finding: any) {
  return {
    ...finding,
    foundDate: toDateStr(finding.foundDate),
    ...(finding.observations
      ? { observations: finding.observations.map(serializeObservation) }
      : {}),
  }
}

function serializeObservation(obs: any) {
  return { ...obs, date: toDateStr(obs.date) }
}

// Observations are the re-inspection trail — oldest first, so the last
// entry is the finding's current state.
const observationsInclude = {
  observations: {
    orderBy: [{ date: 'asc' as const }, { createdAt: 'asc' as const }],
  },
}

function todayUtc(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function requireIdArray(val: unknown, name: string) {
  if (val !== undefined &&
      (!Array.isArray(val) || val.some((v: unknown) => typeof v !== 'string'))) {
    throw Errors.validation(`${name} must be an array of ids`)
  }
}

function requireSeverity(val: unknown) {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 3) {
    throw Errors.validation('severity must be an integer between 1 and 3')
  }
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/findings
// All findings for the farm, filterable: ?fieldId=...&status=open
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    await requireFarmOwnership(userId, farmId)

    const { fieldId, status } = req.query
    if (status && !FINDING_STATUSES.includes(String(status))) {
      throw Errors.validation(`status must be one of: ${FINDING_STATUSES.join(', ')}`)
    }

    const findings = await prisma.finding.findMany({
      where: {
        ...ownedByFarm(farmId),
        ...(fieldId ? { fieldId: String(fieldId) } : {}),
        ...(status ? { status: String(status) } : {}),
      },
      include: observationsInclude,
      orderBy: [{ foundDate: 'desc' }, { createdAt: 'desc' }],
    })

    res.json({ success: true, data: findings.map(serializeFinding) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/farms/:farmId/findings/export
// Sanitary record as CSV — one row per observation, so the file shows the
// full re-inspection history certifiers ask for. Registered before any
// /:id route so "export" is never captured as an id.
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

    const findings = await prisma.finding.findMany({
      where: ownedByFarm(farmId),
      include: {
        field: { select: { name: true } },
        ...observationsInclude,
      },
      orderBy: [{ foundDate: 'desc' }, { createdAt: 'desc' }],
    })

    // Minimal CSV escaping: wrap in quotes, double any embedded quotes.
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }

    const header = 'finding_date,observation_date,field,pest,severity,status,rows_affected,plants_affected,has_treatment,notes'
    const rows = findings.flatMap(f =>
      f.observations.map(obs =>
        [
          toDateStr(f.foundDate),
          toDateStr(obs.date),
          f.field?.name ?? '',
          f.pestId,
          obs.severity,
          f.status,
          Array.isArray(obs.rowIds) ? (obs.rowIds as unknown[]).length || '' : '',
          Array.isArray(obs.plantIds) ? (obs.plantIds as unknown[]).length || '' : '',
          f.treatmentRecommendedOperationId ? 'yes' : '',
          obs.notes ?? '',
        ].map(esc).join(',')
      )
    )

    const filename = `sanidad-${farm.name.replace(/[^\w\-]+/g, '_')}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send([header, ...rows].join('\n'))
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/findings
// Register a finding: pest + severity + scope (+ optional notes/date).
// ─────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const userId = req.user!.userId

    requireFields(req.body, ['fieldId', 'pestId', 'severity'])
    await requireFarmOwnership(userId, farmId)

    const { fieldId, pestId, severity, foundDate, notes, rowIds, plantIds } = req.body
    requireSeverity(severity)
    requireIdArray(rowIds, 'rowIds')
    requireIdArray(plantIds, 'plantIds')

    const field = await prisma.field.findFirst({
      where: { id: fieldId, farmId, deletedAt: { equals: null } },
    })
    if (!field) throw Errors.notFound('Field')

    const date = new Date(foundDate ?? todayUtc())

    // The finding and its first observation are born together — the
    // observation trail is the history, the finding mirrors the latest.
    const finding = await prisma.finding.create({
      data: {
        fieldId,
        pestId: String(pestId),
        severity,
        foundDate: date,
        notes: notes ?? null,
        rowIds: rowIds ?? [],
        plantIds: plantIds ?? [],
        // "por Luis" — who scouted it
        performedByUserId: userId,
        observations: {
          create: {
            date,
            severity,
            rowIds: rowIds ?? [],
            plantIds: plantIds ?? [],
            notes: notes ?? null,
            performedByUserId: userId,
          },
        },
      },
      include: observationsInclude,
    })

    res.status(201).json({ success: true, data: serializeFinding(finding) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// PATCH /api/v1/farms/:farmId/findings/:id
// Update a finding — mostly the manual status lifecycle (open → treated →
// resolved), but severity/scope/notes corrections are allowed too.
// ─────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Finding')
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.finding.findFirst({
      where: { id, ...ownedByFarm(farmId) },
    })
    if (!existing) throw Errors.notFound('Finding')

    const { pestId, severity, status, foundDate, notes, rowIds, plantIds } = req.body

    if (status !== undefined && !FINDING_STATUSES.includes(status)) {
      throw Errors.validation(`status must be one of: ${FINDING_STATUSES.join(', ')}`)
    }
    if (severity !== undefined) requireSeverity(severity)
    requireIdArray(rowIds, 'rowIds')
    requireIdArray(plantIds, 'plantIds')

    const updateData: Record<string, unknown> = {}
    if (pestId !== undefined) updateData.pestId = String(pestId)
    if (severity !== undefined) updateData.severity = severity
    if (status !== undefined) updateData.status = status
    if (foundDate !== undefined) updateData.foundDate = new Date(foundDate)
    if (notes !== undefined) updateData.notes = notes
    if (rowIds !== undefined) updateData.rowIds = rowIds
    if (plantIds !== undefined) updateData.plantIds = plantIds

    const updated = await prisma.finding.update({
      where: { id },
      data: updateData,
    })

    res.json({ success: true, data: serializeFinding(updated) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/findings/:id/observations
// Register a re-inspection ("seguimiento") — the Parcial of findings: a
// dated severity + scope entry against the same finding. The finding's
// own severity/scope mirror the latest observation, so map paint and
// field health always read the current state. Status is NOT touched —
// improving vs. reopening stays the farmer's call.
// ─────────────────────────────────────────────────────────────────────
router.post('/:id/observations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Finding')
    requireFields(req.body, ['severity'])
    await requireFarmOwnership(userId, farmId)

    const finding = await prisma.finding.findFirst({
      where: { id, ...ownedByFarm(farmId) },
    })
    if (!finding) throw Errors.notFound('Finding')

    const { date, severity, notes, rowIds, plantIds } = req.body
    requireSeverity(severity)
    requireIdArray(rowIds, 'rowIds')
    requireIdArray(plantIds, 'plantIds')

    const obsDate = new Date(date ?? todayUtc())

    const updated = await prisma.finding.update({
      where: { id: finding.id },
      data: {
        // Mirror of the latest state — history lives in the observations.
        severity,
        rowIds: rowIds ?? [],
        plantIds: plantIds ?? [],
        observations: {
          create: {
            date: obsDate,
            severity,
            rowIds: rowIds ?? [],
            plantIds: plantIds ?? [],
            notes: notes ?? null,
            performedByUserId: userId,
          },
        },
      },
      include: observationsInclude,
    })

    res.status(201).json({ success: true, data: serializeFinding(updated) })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/v1/farms/:farmId/findings/:id
// Hard delete — findings are lightweight observations; any treatment labor
// created from one lives on in the calendar untouched.
// ─────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Finding')
    await requireFarmOwnership(userId, farmId)

    const existing = await prisma.finding.findFirst({
      where: { id, ...ownedByFarm(farmId) },
    })
    if (!existing) throw Errors.notFound('Finding')

    await prisma.finding.delete({ where: { id } })

    res.json({ success: true, data: { success: true } })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/farms/:farmId/findings/:id/create-operation
// "Crear labor": one coarse treatment recommendation from a finding.
// The client picks the planting event (it knows which event the affected
// plants belong to) and sends the display label; the suggested scope
// travels in the notes — the farmer confirms the real scope at check-off
// with the normal selector. Body: { plantingEventId, labelEs, type?,
// recommendedDate?, notes? }.
// ─────────────────────────────────────────────────────────────────────
router.post('/:id/create-operation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string
    const id = req.params.id as string
    const userId = req.user!.userId

    requireValidId(id, 'Finding')
    requireFields(req.body, ['plantingEventId', 'labelEs'])
    await requireFarmOwnership(userId, farmId)

    const finding = await prisma.finding.findFirst({
      where: { id, ...ownedByFarm(farmId) },
    })
    if (!finding) throw Errors.notFound('Finding')
    // One OPEN labor at a time — but a finding that worsened after its
    // treatment was completed (or skipped) can get a new one.
    if (finding.treatmentRecommendedOperationId) {
      const previous = await prisma.recommendedOperation.findUnique({
        where: { id: finding.treatmentRecommendedOperationId },
      })
      if (previous && previous.status !== 'completed' && previous.status !== 'skipped') {
        throw Errors.conflict('An open treatment operation already exists for this finding')
      }
    }

    const { plantingEventId, labelEs, type, recommendedDate, notes } = req.body

    if (type !== undefined && !TREATMENT_TYPES.includes(type)) {
      throw Errors.validation(`type must be one of: ${TREATMENT_TYPES.join(', ')}`)
    }

    // The recommendation calendar hangs off planting events — the event must
    // belong to the same field the finding is on.
    const event = await prisma.plantingEvent.findFirst({
      where: { id: plantingEventId, fieldId: finding.fieldId },
    })
    if (!event) throw Errors.notFound('Planting event')

    const date = new Date(recommendedDate ?? todayUtc())

    const result = await prisma.$transaction(async (tx) => {
      const recOp = await tx.recommendedOperation.create({
        data: {
          plantingEventId,
          templateId: 'finding_treatment',
          type: type ?? 'spray',
          labelEs: String(labelEs),
          recommendedDate: date,
          status: date < todayUtc() ? 'due' : 'pending',
          notes: notes ?? null,
        },
      })
      const updated = await tx.finding.update({
        where: { id: finding.id },
        data: { treatmentRecommendedOperationId: recOp.id },
      })
      return { recOp, finding: updated }
    })

    res.status(201).json({
      success: true,
      data: {
        finding: serializeFinding(result.finding),
        recommendedOperation: {
          ...result.recOp,
          quantity: result.recOp.quantity !== null ? Number(result.recOp.quantity) : null,
          recommendedDate: toDateStr(result.recOp.recommendedDate),
          completedDate: result.recOp.completedDate ? toDateStr(result.recOp.completedDate) : null,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
