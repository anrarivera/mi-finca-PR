import { Router, Request, Response, NextFunction } from 'express'
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
router.put('/', async (req: Request, res: Response, next: NextFunction) => {
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
router.post('/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await resetSampleFarm(req.user!.userId)

    res.json({ success: true, data: status })
  } catch (err) {
    next(err)
  }
})

export default router
