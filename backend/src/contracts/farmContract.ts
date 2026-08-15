import { z } from 'zod'
import { latLng, isoDate, absentIfNull } from './common'

export const farmResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  farmType: z.enum(['crop', 'livestock', 'mixed', 'apiary']),
  boundary: z.array(latLng),
  totalAreaAcres: z.number(),
  isFavorite: z.boolean(),
  description: z.string().nullable(),
  fieldIds: z.array(z.string()),
  createdAt: isoDate,
  updatedAt: isoDate,
  // The requesting user's role — present on listings and single-farm GETs.
  myRole: absentIfNull(z.enum(['owner', 'admin', 'operator'])),
})

export type FarmResponse = z.output<typeof farmResponseSchema>
