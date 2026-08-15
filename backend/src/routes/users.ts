import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { parseBody } from '../lib/validate'
import { requireAuth } from '../middleware/auth'
import { buildExport, restoreFromBackup, clearUserData, BACKUP_VERSION } from '../lib/backup'
import { restoreBackupRequestSchema } from '../contracts/backupContract'
import { Errors } from '../lib/errors'

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
  // Email reminders (lib/dailyDigest.ts) — opt-out
  emailDigest: true,
  // 'novedades' = only when a labor crosses a line (enters the window /
  // due today / newly overdue); 'semanal' = Mondays with anything pending.
  emailFrequency: 'novedades',
}

const notificationPrefsSchema = z.object({
  enabled: z.boolean().optional(),
  notifyOverdue: z.boolean().optional(),
  notifyDueSoon: z.boolean().optional(),
  notifyHarvest: z.boolean().optional(),
  dueSoonLeadDays: z.number().int().min(1).max(60).optional(),
  emailDigest: z.boolean().optional(),
  emailFrequency: z.enum(['novedades', 'semanal']).optional(),
})

// ── PATCH /api/v1/users/me — profile settings (language drives the
//    digest email; the UI language itself lives client-side) ───────────
const profileSchema = z.object({ language: z.enum(['es', 'en']) })
router.patch('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { language } = parseBody(profileSchema, req.body)
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { language },
    })
    res.json({ success: true, data: { language } })
  } catch (err) { next(err) }
})

// ── DELETE /api/v1/users/me — the erasure right (privacy policy) ───────
// Password-confirmed. Deleting the user cascades: owned farms and ALL
// their data (fields, plantings, operations, yields, findings, herds,
// memberships, invites), plus the user's own memberships on other farms.
// Records the user created on OTHER people's farms remain, but their
// performedByUserId is nulled (relation is SetNull) — the farm keeps its
// history, the person's identity leaves.
router.delete('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body ?? {}
    if (!password || typeof password !== 'string') {
      throw Errors.validation('password is required to delete the account')
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user?.passwordHash) throw Errors.unauthorized()

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) throw Errors.validation('Invalid password')

    await prisma.$transaction([
      // refresh_tokens has no FK relation — clean it up explicitly
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ])

    res.clearCookie('refreshToken', { path: '/api/v1/auth' })
    res.json({ success: true, data: { deleted: true } })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/v1/users/me/export — full account backup (v2) ─────────────
// Everything the account owns, straight from the database: farms with
// fields/rows/plants/events/calendar, the operations log, harvests,
// findings, livestock, team roster, custom crops.
router.get('/me/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await buildExport(req.user!.userId)
    const filename = `mi-finca-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(JSON.stringify(data, null, 2))
  } catch (err) {
    next(err)
  }
})

// ── POST /api/v1/users/me/restore — transactional replace ──────────────
router.post('/me/restore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body ?? {}
    if (typeof body.version === 'number' && body.version < BACKUP_VERSION) {
      throw Errors.validation(
        'Este respaldo es de una versión anterior de la app y no contiene todos tus registros. Exporta un respaldo nuevo.'
      )
    }
    if (typeof body.version === 'number' && body.version > BACKUP_VERSION) {
      throw Errors.validation('Este respaldo es de una versión más nueva de la app.')
    }
    parseBody(restoreBackupRequestSchema, body)
    const result = await restoreFromBackup(req.user!.userId, body)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/v1/users/me/clear-data — delete all owned farm data ──────
router.post('/me/clear-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await clearUserData(req.user!.userId)
    res.json({ success: true, data: { cleared: true } })
  } catch (err) {
    next(err)
  }
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
