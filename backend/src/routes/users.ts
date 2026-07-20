import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { parseBody } from '../lib/validate'
import { requireAuth } from '../middleware/auth'

// ──────────────────────────────────────────────────────────────────────────
// Per-user preferences (issues #9/#14). Notification preferences mirror the
// frontend's NotificationPrefs shape; they are stored as JSON on the user
// row so future delivery channels (issue #11: email/SMS) read one source.
// ──────────────────────────────────────────────────────────────────────────

const router = Router()
router.use(requireAuth)

const DEFAULT_NOTIFICATION_PREFS = {
  enabled: true,
  notifyOverdue: true,
  notifyDueSoon: true,
  notifyHarvest: true,
  dueSoonLeadDays: 14,
}

const notificationPrefsSchema = z.object({
  enabled: z.boolean().optional(),
  notifyOverdue: z.boolean().optional(),
  notifyDueSoon: z.boolean().optional(),
  notifyHarvest: z.boolean().optional(),
  dueSoonLeadDays: z.number().int().min(1).max(60).optional(),
})

// ── GET /api/v1/users/me/notification-prefs ────────────────────────────
router.get('/me/notification-prefs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { notificationPrefs: true },
    })
    const stored = (user?.notificationPrefs ?? {}) as Record<string, unknown>
    res.json({ success: true, data: { ...DEFAULT_NOTIFICATION_PREFS, ...stored } })
  } catch (err) { next(err) }
})

// ── PUT /api/v1/users/me/notification-prefs — partial merge ────────────
router.put('/me/notification-prefs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patch = parseBody(notificationPrefsSchema, req.body)
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { notificationPrefs: true },
    })
    const merged = {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...((user?.notificationPrefs ?? {}) as Record<string, unknown>),
      ...patch,
    }
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { notificationPrefs: merged },
    })
    res.json({ success: true, data: merged })
  } catch (err) { next(err) }
})

export default router
