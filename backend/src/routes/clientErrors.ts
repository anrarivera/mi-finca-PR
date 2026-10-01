import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { optionalAuth } from '../middleware/auth'
import { logger } from '../lib/logger'

// ──────────────────────────────────────────────────────────────────────────
// Client error intake — the frontend reports uncaught exceptions, unhandled
// rejections, and React render crashes here, so browser-side failures land
// in the same structured log stream as server errors (searchable on the
// host). Accepts anonymous reports (crashes happen logged-out too) but is
// rate-limited and size-capped so it can't be used as a log-flooding vector.
// Always answers 204: error reporting must never throw errors.
// ──────────────────────────────────────────────────────────────────────────

const router = Router()

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req, res) => { res.status(204).end() },
})

const reportSchema = z.object({
  message: z.string().max(1000),
  stack: z.string().max(8000).nullish(),
  source: z.enum(['window.onerror', 'unhandledrejection', 'react-error-boundary']).catch('window.onerror'),
  url: z.string().max(500).nullish(),
  userAgent: z.string().max(300).nullish(),
  appVersion: z.string().max(50).nullish(),
})

router.post('/', reportLimiter, optionalAuth, (req: Request, res: Response) => {
  const parsed = reportSchema.safeParse(req.body)
  if (parsed.success) {
    logger.error({
      client: true,
      ...parsed.data,
      userId: req.user?.userId ?? null,
    }, 'client error')
  }
  res.status(204).end()
})

export default router
