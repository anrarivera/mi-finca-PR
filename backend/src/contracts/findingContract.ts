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
