import { z } from 'zod'
import { logger } from '../lib/logger'

// ──────────────────────────────────────────────────────────────────────────
// Shared contract building blocks + the enforcement helper every resource
// serializer runs through. See fieldContract.ts for the pattern's origin.
// ──────────────────────────────────────────────────────────────────────────

export const latLng = z.object({ lat: z.number(), lng: z.number() })

// Prisma hands us Date objects; the wire carries ISO strings. Accept both
// so route-built objects that already hold strings parse too.
export const isoDate = z.union([z.date().transform(d => d.toISOString()), z.string()])

// Optional-on-the-wire: DB nulls become absent keys so frontend `?.` types
// match without null-vs-undefined friction.
export const absentIfNull = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform(v => (v === null ? undefined : v))

// Parse a built response through its contract: unknown keys are STRIPPED,
// shape drift logs loudly — but fails soft, because a contract mismatch
// must never take a farmer's data offline.
export function enforceContract<S extends z.ZodTypeAny>(
  schema: S,
  built: unknown,
  label: string
): z.output<S> {
  const parsed = schema.safeParse(built)
  if (!parsed.success) {
    // In tests, fail HARD: the API suite exercises every route, which
    // makes it the proof that each contract matches what routes really
    // produce. Fail-soft there would hide exactly the drift this exists
    // to catch.
    if (process.env.NODE_ENV === 'test') {
      throw new Error(
        `Contract violation [${label}]: ` +
        JSON.stringify(parsed.error.issues.slice(0, 3))
      )
    }
    logger.error({
      contract: label,
      issues: parsed.error.issues.slice(0, 5),
    }, 'response violates contract — serving unparsed body')
    return built as z.output<S>
  }
  return parsed.data
}
