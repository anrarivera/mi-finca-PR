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

// ── Geographic bounds (SRS NFR-4) ─────────────────────────────────────
// Coordinates are bounded WGS84 lat/lng. The client enforces this too, but
// the API is the contract: reject out-of-range points server-side.

export function requireLat(value: unknown, context: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 90) {
    throw Errors.validation(`${context} must be a latitude within ±90`)
  }
}

export function requireLng(value: unknown, context: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 180) {
    throw Errors.validation(`${context} must be a longitude within ±180`)
  }
}

// Boundaries are arrays of { lat, lng } points. undefined/null = "not
// updating the boundary" and passes through.
export function requireBoundaryBounds(boundary: unknown, context = 'boundary') {
  if (boundary === undefined || boundary === null) return
  if (!Array.isArray(boundary)) {
    throw Errors.validation(`${context} must be an array of { lat, lng } points`)
  }
  boundary.forEach((p, i) => {
    requireLat(p?.lat, `${context}[${i}].lat`)
    requireLng(p?.lng, `${context}[${i}].lng`)
  })
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
// Sale revenue on production entries — optional, but when present it must
// be a non-negative number.
// The quantity/revenue columns are Decimal(10,3)/(10,2) — values beyond
// ~10M overflow Postgres numerics and surface as generic 500s. Cap well
// below the column limit with a farmer-readable message.
const MAX_AMOUNT = 9_999_999

export function requireRevenue(value: unknown, name = 'revenue'): void {
  if (value === undefined || value === null) return
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw Errors.validation(`${name} must be a non-negative number`)
  }
  if (value > MAX_AMOUNT) {
    throw Errors.validation('El valor en dólares es demasiado grande (máximo 9,999,999)')
  }
}

// Names render in map tooltips and cards — unbounded ones (a 175-char
// field name) turn into screen-wide labels. Enforced here because the
// input maxLength is only a convenience, not a guarantee.
export function requireNameLength(value: unknown, max = 80): void {
  if (typeof value === 'string' && value.trim().length > max) {
    throw Errors.validation(`El nombre es demasiado largo (máximo ${max} caracteres)`)
  }
}

export function requireQuantity(value: unknown, name = 'quantity'): void {
  if (value === undefined || value === null) return
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw Errors.validation(`${name} must be a non-negative number`)
  }
  if (value > MAX_AMOUNT) {
    throw Errors.validation('La cantidad es demasiado grande (máximo 9,999,999)')
  }
}
