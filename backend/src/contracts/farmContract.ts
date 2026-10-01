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

// ── Request bodies ──────────────────────────────────────────────────────
// Liberal on purpose (loose objects — unknown keys pass through): requests
// are validated for the structure and types of everything the server
// READS. The Spanish domain guards (name lengths, quantity caps, geometry
// bounds, farm containment) still run after this structural gate.

export const createFarmRequestSchema = z.looseObject({
  name: z.string().min(1),
  location: z.string().min(1),
  farmType: z.enum(['crop', 'livestock', 'mixed', 'apiary']).optional(),
  description: z.string().nullish(),
})

export const updateFarmRequestSchema = z.looseObject({
  name: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  farmType: z.enum(['crop', 'livestock', 'mixed', 'apiary']).optional(),
  description: z.string().nullish(),
  boundary: z.array(latLng).optional(),
  isFavorite: z.boolean().optional(),
})

export const joinFarmRequestSchema = z.looseObject({
  code: z.string().min(1),
})
