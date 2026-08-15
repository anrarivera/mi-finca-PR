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
