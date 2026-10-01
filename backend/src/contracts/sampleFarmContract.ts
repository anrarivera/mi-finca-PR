import { z } from 'zod'
import { isoDate } from './common'

// The sample-farm switch as Settings sees it. Nothing is stored for it:
// `enabled` means a sample farm exists in the account, `seededAt` is when
// that farm was seeded, and `resetsAt` (seededAt + ttlDays) is when what
// the user changed in it expires — the nightly job re-seeds the farm on
// its first run after that moment.
export const sampleFarmStatusSchema = z.object({
  enabled: z.boolean(),
  farmId: z.string().nullable(),
  seededAt: isoDate.nullable(),
  resetsAt: isoDate.nullable(),
  ttlDays: z.number(),
})

export type SampleFarmStatus = z.output<typeof sampleFarmStatusSchema>

// ── Request bodies ──────────────────────────────────────────────────────

export const setSampleFarmRequestSchema = z.looseObject({
  enabled: z.boolean(),
})
