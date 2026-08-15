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
