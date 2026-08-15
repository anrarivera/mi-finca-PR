import { z } from 'zod'
import { isoDate, absentIfNull } from './common'

// ── Operations log entries (the cuaderno's "labores realizadas") ────────
export const operationResponseSchema = z.object({
  id: z.string(),
  farmId: z.string(),
  fieldId: z.string().nullable(),
  plantingEventId: z.string().nullable(),
  livestockUnitId: z.string().nullable(),
  recommendedOperationId: z.string().nullable(),
  type: z.string(),
  actualDate: z.string(),
  notes: z.string().nullable(),
  product: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  qualityRating: z.number().nullable(),
  photoUrls: z.array(z.string()),
  rowIds: z.array(z.string()),
  plantIds: z.array(z.string()),
  // Livestock ledger: herd-count change carried by this operation.
  countDelta: z.number().nullable(),
  countReason: z.string().nullable(),
  performedByUserId: z.string().nullable(),
  // Joined on farm-scoped listings ("por Luis"); absent on write echoes.
  performedBy: absentIfNull(z.object({ id: z.string(), fullName: z.string() })),
  createdAt: isoDate,
  updatedAt: isoDate,
})

export type OperationResponse = z.output<typeof operationResponseSchema>

// ── Recommended operations (the agronomic calendar) ─────────────────────
// Standalone listings — unlike the event-nested shape in fieldContract,
// these can belong to livestock (null plantingEventId) and carry joined
// labeling context.
export const recommendedOperationListItemSchema = z.object({
  id: z.string(),
  plantingEventId: z.string().nullable(),
  livestockUnitId: z.string().nullable(),
  templateId: z.string(),
  // Custom crops define their own operation types — wider than the
  // frontend's built-in union on purpose.
  type: z.string(),
  labelEs: z.string(),
  recommendedDate: z.string(),
  status: z.enum(['pending', 'due', 'completed', 'skipped']),
  completedDate: z.string().nullable(),
  completedOperationId: z.string().nullable(),
  notes: z.string().nullable(),
  product: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
  plantingEvent: absentIfNull(z.object({
    id: z.string(),
    fieldId: z.string(),
    cropTypeId: z.string(),
    plantingDate: isoDate,
  })),
  livestockUnit: absentIfNull(z.object({
    id: z.string(),
    name: z.string(),
    animalType: z.string(),
  })),
})

export type RecommendedOperationListItem = z.output<typeof recommendedOperationListItemSchema>

export const dueSoonResponseSchema = z.object({
  overdueCount: z.number(),
  dueSoonCount: z.number(),
  operations: z.array(recommendedOperationListItemSchema),
})

export type DueSoonResponse = z.output<typeof dueSoonResponseSchema>
