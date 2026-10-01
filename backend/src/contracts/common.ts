import { z } from 'zod'

// ──────────────────────────────────────────────────────────────────────────
// Shared contract building blocks. PURE ZOD ONLY in this file and every
// schema file — the frontend type-imports them (contract test), so any
// server-only import here (logger, node builtins) breaks the frontend
// typecheck in CI. Runtime enforcement lives in ./enforce.ts.
// ──────────────────────────────────────────────────────────────────────────

export const latLng = z.object({ lat: z.number(), lng: z.number() })

// Prisma hands us Date objects; the wire carries ISO strings. Accept both
// so route-built objects that already hold strings parse too.
export const isoDate = z.union([z.date().transform(d => d.toISOString()), z.string()])

// Optional-on-the-wire: DB nulls become absent keys so frontend `?.` types
// match without null-vs-undefined friction.
export const absentIfNull = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform(v => (v === null ? undefined : v))
