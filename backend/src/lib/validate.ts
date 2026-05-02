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