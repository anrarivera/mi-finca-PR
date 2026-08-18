import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { Errors } from '../lib/errors'
import { parseBody } from '../lib/validate'
import { requireAuth, optionalAuth } from '../middleware/auth'
import { enforceContract } from '../contracts/enforce'
import { cropResponseSchema, cropBodyRequestSchema } from '../contracts/cropContract'

// ──────────────────────────────────────────────────────────────────────────
// Crop knowledge base. Crops are IDENTITY only — name, emoji, category;
// practice lives on recipes (routes/recipes.ts). Built-in crops are seeded
// rows (isBuiltIn=true, no owner) that anyone can read and nobody edits;
// custom crops belong to the user who created them and stay private until
// a curation path canonicalizes them (Recetas de Cultivo design).
// ──────────────────────────────────────────────────────────────────────────

const router = Router()

function serializeCrop(crop: any) {
  return enforceContract(cropResponseSchema, crop, 'crop')
}

async function findOwnedCustomCrop(userId: string, cropId: string) {
  const crop = await prisma.cropType.findFirst({
    where: { id: cropId, userId, isBuiltIn: false },
  })
  if (!crop) throw Errors.notFound('Crop')
  return crop
}

// ── GET /api/v1/crops — built-ins plus the caller's custom crops ───────
router.get('/', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const crops = await prisma.cropType.findMany({
      where: req.user
        ? { OR: [{ isBuiltIn: true }, { userId: req.user.userId }] }
        : { isBuiltIn: true },
      orderBy: [{ isBuiltIn: 'desc' }, { category: 'asc' }, { nameEs: 'asc' }],
    })
    res.json({ success: true, data: crops.map(serializeCrop) })
  } catch (err) { next(err) }
})

// ── POST /api/v1/crops — create a custom crop ──────────────────────────
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = parseBody(cropBodyRequestSchema, req.body)
    const crop = await prisma.cropType.create({
      data: {
        userId: req.user!.userId,
        name: body.name ?? body.nameEs,
        nameEs: body.nameEs,
        emoji: body.emoji ?? '🌱',
        category: body.category ?? 'Personalizados',
        isBuiltIn: false,
      },
    })
    res.status(201).json({ success: true, data: serializeCrop(crop) })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/crops/:id — update own custom crop ─────────────────────
router.put('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cropId = String(req.params.id)
    await findOwnedCustomCrop(req.user!.userId, cropId)
    const body = parseBody(cropBodyRequestSchema.partial(), req.body)

    const crop = await prisma.cropType.update({
      where: { id: cropId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.nameEs !== undefined ? { nameEs: body.nameEs } : {}),
        ...(body.emoji !== undefined ? { emoji: body.emoji } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
      },
    })
    res.json({ success: true, data: serializeCrop(crop) })
  } catch (err) { next(err) }
})

// ── DELETE /api/v1/crops/:id — delete own custom crop ──────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cropId = String(req.params.id)
    await findOwnedCustomCrop(req.user!.userId, cropId)
    // Hard delete: recipes on the crop cascade (versions with them);
    // plantings that referenced those versions fall back to no reference.
    await prisma.cropType.delete({ where: { id: cropId } })
    res.json({ success: true, data: { id: cropId } })
  } catch (err) { next(err) }
})

export default router
