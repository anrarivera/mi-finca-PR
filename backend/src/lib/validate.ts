import type { ZodType } from 'zod'
import { Errors } from './errors'

// Parse a request body against a zod schema, converting failures into the
// app's standard VALIDATION_ERROR shape (with per-field details).
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw Errors.validation('Invalid request data', {
      issues: result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return result.data
}
