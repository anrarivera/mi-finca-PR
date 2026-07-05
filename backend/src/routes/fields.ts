import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import { parseBody } from '../lib/validate'
import { requireAuth } from '../middleware/auth'
import { fieldBodySchema } from './farms'

// Field update/delete by id. Ownership is checked through the parent farm.

const router = Router()
router.use(requireAuth)

async function findOwnedField(userId: string, fieldId: string) {
  const field = await prisma.field.findFirst({
    where: { id: fieldId, deletedAt: null, farm: { userId, deletedAt: null } },
  })
  if (!field) throw Errors.notFound('Field')
  return field
}

// ── PUT /api/v1/fields/:id ─────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedField(req.user!.userId, String(req.params.id))
    const body = parseBody(fieldBodySchema.partial(), req.body)
    const field = await prisma.field.update({
      where: { id: String(req.params.id) },
      data: body,
    })
    res.json({ success: true, data: field })
  } catch (err) { next(err) }
})

// ── DELETE /api/v1/fields/:id — soft delete ────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedField(req.user!.userId, String(req.params.id))
    await prisma.field.update({
      where: { id: String(req.params.id) },
      data: { deletedAt: new Date() },
    })
    res.json({ success: true, data: { id: String(req.params.id) } })
  } catch (err) { next(err) }
})

export default router
