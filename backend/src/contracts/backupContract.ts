import { z } from 'zod'

// Restore gate — deliberately shallow: it verifies this is a v2 Mi Finca
// backup with the expected top-level shape, then lib/backup.ts normalizes
// field-by-field (coercing Decimal-strings, nulling dead user references).
// v1 backups are REJECTED: they were client-store snapshots that never
// contained the operations log, harvests, or findings — "restoring" one
// would silently discard most of an account's records.
export const restoreBackupRequestSchema = z.looseObject({
  app: z.literal('mi-finca-pr'),
  version: z.number(),
  farms: z.array(z.looseObject({
    id: z.string(),
    name: z.string(),
    location: z.string(),
    fields: z.array(z.looseObject({ id: z.string(), name: z.string() })).optional(),
  })),
  customCrops: z.array(z.looseObject({ id: z.string() })).optional(),
})
