import { z } from 'zod'
import { isoDate } from './common'

// One row of the unified production ledger: crop harvests carry
// cropTypeId, animal production carries livestockUnitId + productId.
export const harvestResponseSchema = z.object({
  id: z.string(),
  farmId: z.string(),
  fieldId: z.string().nullable(),
  operationId: z.string().nullable(),
  cropTypeId: z.string().nullable(),
  livestockUnitId: z.string().nullable(),
  productId: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  revenue: z.number().nullable(),
  harvestDate: isoDate,
  notes: z.string().nullable(),
  createdAt: isoDate,
})

export type HarvestResponse = z.output<typeof harvestResponseSchema>

// ── Request bodies ──────────────────────────────────────────────────────
// Liberal on purpose (loose objects — unknown keys pass through): requests
// are validated for the structure and types of everything the server
// READS. The Spanish domain guards (name lengths, quantity caps, geometry
// bounds, farm containment) still run after this structural gate.

export const createHarvestRequestSchema = z.looseObject({
  cropTypeId: z.string().min(1),
  quantity: z.number(),
  unit: z.string().min(1),
  harvestDate: z.string().min(1),
  fieldId: z.string().nullish(),
  notes: z.string().nullish(),
  revenue: z.number().nullish(),
})

export const updateHarvestRequestSchema = z.looseObject({
  cropTypeId: z.string().min(1).optional(),
  quantity: z.number().optional(),
  unit: z.string().min(1).optional(),
  harvestDate: z.string().min(1).optional(),
  fieldId: z.string().nullish(),
  notes: z.string().nullish(),
  revenue: z.number().nullish(),
})
