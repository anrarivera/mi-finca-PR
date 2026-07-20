import type { ZodType } from 'zod'
import { Errors } from './errors'

export function requireFields(
  body: Record<string, unknown>,
  fields: string[]
) {
  const missing = fields.filter(f => !body[f])
  if (missing.length > 0) {
    throw Errors.validation(
      `Missing required fields: ${missing.join(', ')}`
    )
  }
}

export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export function requireValidId(id: string, resource = 'Resource') {
  if (!id || !isValidUUID(id)) {
    throw Errors.notFound(resource)
  }
}

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