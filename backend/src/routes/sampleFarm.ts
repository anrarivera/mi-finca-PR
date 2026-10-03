import { Router, Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth'
import { parseBody } from '../lib/validate'
import { setSampleFarmRequestSchema } from '../contracts/sampleFarmContract'
import {
  getSampleFarmStatus, enableSampleFarm, disableSampleFarm, resetSampleFarm,
} from '../lib/sampleFarm'

// ──────────────────────────────────────────────────────────────────────────
// The sample farm inside a real account — the switch in Settings (see
// lib/sampleFarm). Every answer is the state of the switch AFTER the
// request. Mounted at /api/v1/users/me/sample-farm
// ──────────────────────────────────────────────────────────────────────────

const router = Router()

router.use(requireAuth)

// ── Rate limiting — every switch-on and every reset throws a farm away
// and seeds a new one: a few dozen inserts in one long transaction. A
// person does that a handful of times; a script in a loop would keep the
// database busy. Counted per ACCOUNT, not per IP — the caller is always
// signed in here, and a whole crew can share one address.
// Switching OFF is never limited: it seeds nothing, and someone who has
// used up the budget must still be able to get rid of the sample farm.
export const SAMPLE_FARM_SEEDS_PER_WINDOW = 10
const SEED_WINDOW_MS = 15 * 60 * 1000

const seedLimiter = rateLimit({
  windowMs: SEED_WINDOW_MS,
  limit: SAMPLE_FARM_SEEDS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.user!.userId,
  skip: req =>
    req.body?.enabled === false ||
    // The suite seeds far more often than a person would. The limiter's
    // own test switches it on with RATE_LIMIT_IN_TESTS.
    (process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== '1'),
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
    })
  },
})

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/users/me/sample-farm
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await getSampleFarmStatus(req.user!.userId)

    res.json({ success: true, data: status })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// PUT /api/v1/users/me/sample-farm  { enabled }
// On: a fresh sample farm (also when it was already on). Off: removed
// completely — it can always be switched on again.
// ─────────────────────────────────────────────────────────────────────
router.put('/', seedLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled } = parseBody(setSampleFarmRequestSchema, req.body)

    const status = enabled
      ? await enableSampleFarm(req.user!.userId)
      : await disableSampleFarm(req.user!.userId)

    res.json({ success: true, data: status })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/users/me/sample-farm/reset
// Back to the default data now, without waiting for the nightly job.
// ─────────────────────────────────────────────────────────────────────
router.post('/reset', seedLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await resetSampleFarm(req.user!.userId)

    res.json({ success: true, data: status })
  } catch (err) {
    next(err)
  }
})

export default router
