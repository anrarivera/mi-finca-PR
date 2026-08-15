import { z } from 'zod'
import { logger } from '../lib/logger'

// Runtime contract enforcement — kept SEPARATE from the schema files on
// purpose: the frontend type-imports the schemas (contract test), and the
// schema files must therefore stay pure zod with no server-only imports
// (logger → pino → node types), or the frontend typecheck breaks in CI
// where backend/node_modules doesn't exist.
//
// Parse a built response through its contract: unknown keys are STRIPPED,
// shape drift logs loudly — but fails soft in production, because a
// contract mismatch must never take a farmer's data offline. In tests it
// fails HARD: the API suite exercises every route, which makes it the
// proof that each contract matches what routes really produce.
export function enforceContract<S extends z.ZodTypeAny>(
  schema: S,
  built: unknown,
  label: string
): z.output<S> {
  const parsed = schema.safeParse(built)
  if (!parsed.success) {
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
