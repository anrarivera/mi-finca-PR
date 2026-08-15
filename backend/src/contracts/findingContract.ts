import { z } from 'zod'
import { isoDate } from './common'

export const findingObservationResponseSchema = z.object({
  id: z.string(),
  findingId: z.string(),
  date: z.string(),
  severity: z.number(),
  rowIds: z.array(z.string()),
  plantIds: z.array(z.string()),
  notes: z.string().nullable(),
  performedByUserId: z.string().nullable(),
  createdAt: isoDate,
})

export const findingResponseSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  pestId: z.string(),
  severity: z.number(),
  status: z.enum(['open', 'treated', 'resolved']),
  foundDate: z.string(),
  notes: z.string().nullable(),
  rowIds: z.array(z.string()),
  plantIds: z.array(z.string()),
  treatmentRecommendedOperationId: z.string().nullable(),
  performedByUserId: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
  // The re-inspection trail — included on listings, absent on some writes.
  observations: z.array(findingObservationResponseSchema).optional(),
})

export type FindingResponse = z.output<typeof findingResponseSchema>
export type FindingObservationResponse = z.output<typeof findingObservationResponseSchema>

// ── Request bodies ──────────────────────────────────────────────────────
// Liberal on purpose (loose objects — unknown keys pass through): requests
// are validated for the structure and types of everything the server
// READS. The Spanish domain guards (name lengths, quantity caps, geometry
// bounds, farm containment) still run after this structural gate.

export const createFindingRequestSchema = z.looseObject({
  fieldId: z.string().min(1),
  pestId: z.string().min(1),
  severity: z.number(),
  foundDate: z.string().nullish(),
  notes: z.string().nullish(),
  rowIds: z.array(z.string()).optional(),
  plantIds: z.array(z.string()).optional(),
})

export const updateFindingRequestSchema = z.looseObject({
  pestId: z.string().min(1).optional(),
  severity: z.number().optional(),
  status: z.enum(['open', 'treated', 'resolved']).optional(),
  foundDate: z.string().nullish(),
  notes: z.string().nullish(),
  rowIds: z.array(z.string()).optional(),
  plantIds: z.array(z.string()).optional(),
})

export const observationRequestSchema = z.looseObject({
  severity: z.number(),
  date: z.string().nullish(),
  notes: z.string().nullish(),
  rowIds: z.array(z.string()).optional(),
  plantIds: z.array(z.string()).optional(),
})

export const treatmentRequestSchema = z.looseObject({
  plantingEventId: z.string().min(1),
  labelEs: z.string().min(1),
  type: z.string().nullish(),
  recommendedDate: z.string().nullish(),
  notes: z.string().nullish(),
})
