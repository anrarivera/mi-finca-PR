import { z } from 'zod'
import { isoDate } from './common'

export const livestockResponseSchema = z.object({
  id: z.string(),
  farmId: z.string(),
  // Corral assignment (a livestock-kind field); null = unassigned.
  fieldId: z.string().nullable(),
  name: z.string(),
  // Wider than the frontend's AnimalType union — the column is free text.
  animalType: z.string(),
  currentCount: z.number(),
  acquisitionDate: isoDate,
  farmLat: z.number().nullable(),
  farmLng: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
})

export type LivestockResponse = z.output<typeof livestockResponseSchema>

// ── Request bodies ──────────────────────────────────────────────────────
// Liberal on purpose (loose objects — unknown keys pass through): requests
// are validated for the structure and types of everything the server
// READS. The Spanish domain guards (name lengths, quantity caps, geometry
// bounds, farm containment) still run after this structural gate.

export const createLivestockRequestSchema = z.looseObject({
  name: z.string().min(1),
  animalType: z.string().min(1),
  currentCount: z.number(),
  acquisitionDate: z.string().min(1),
  fieldId: z.string().nullish(),
  farmLat: z.number().nullish(),
  farmLng: z.number().nullish(),
  notes: z.string().nullish(),
})

export const updateLivestockRequestSchema = z.looseObject({
  name: z.string().min(1).optional(),
  animalType: z.string().min(1).optional(),
  currentCount: z.number().optional(),
  acquisitionDate: z.string().min(1).optional(),
  fieldId: z.string().nullish(),
  farmLat: z.number().nullish(),
  farmLng: z.number().nullish(),
  notes: z.string().nullish(),
})

export const productionRequestSchema = z.looseObject({
  productId: z.string().min(1),
  quantity: z.number(),
  unit: z.string().min(1),
  date: z.string().min(1),
  notes: z.string().nullish(),
  headCount: z.number().nullish(),
  countReason: z.string().nullish(),
  revenue: z.number().nullish(),
})
