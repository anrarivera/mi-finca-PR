import { z } from 'zod'

// ──────────────────────────────────────────────────────────────────────────
// THE field API contract — the single runtime authority on what a field
// response contains. serializeField parses its output through this schema:
//  - unknown keys are STRIPPED (the bug where raw Prisma relations rode
//    along and tripled the payload is now structurally impossible)
//  - shape drift is DETECTED (a missing/mistyped key logs loudly instead
//    of silently reaching clients)
// The frontend asserts assignability against these inferred types in a
// compile-time contract test (frontend/src/features/field/apiContract.
// test.ts), so both sides drift-check against one definition.
// ──────────────────────────────────────────────────────────────────────────

import { latLng, isoDate, absentIfNull } from './common'

export const plantResponseSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  rowId: z.string().nullable(),
  plantingEventId: z.string().nullable(),
  cropTypeId: z.string(),
  lat: z.number(),
  lng: z.number(),
  plantingDate: z.string(),
})

export const rowResponseSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  startLat: z.number(),
  startLng: z.number(),
  endLat: z.number(),
  endLng: z.number(),
  spacingFt: z.number(),
  primaryCropTypeId: z.string(),
  companionCropTypeId: z.string().nullable(),
  plantingDate: z.string(),
  path: absentIfNull(z.array(latLng)),
  pathClosed: absentIfNull(z.boolean()),
  createdAt: isoDate,
  plants: z.array(plantResponseSchema),
})

export const recommendedOperationResponseSchema = z.object({
  id: z.string(),
  plantingEventId: z.string(),
  // Wider than the frontend's built-in union on purpose: custom crops
  // define their own operation types (crops.ts opTemplateSchema).
  type: z.string(),
  templateId: z.string(),
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
})

export const plantingEventResponseSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  cropTypeId: z.string(),
  plantingDate: z.string(),
  plantCount: z.number(),
  rowIds: z.array(z.string()),
  freePlantIds: z.array(z.string()),
  operations: z.array(recommendedOperationResponseSchema),
  createdAt: isoDate,
})

export const fieldResponseSchema = z.object({
  id: z.string(),
  farmId: z.string(),
  name: z.string(),
  kind: z.enum(['crops', 'livestock']),
  color: z.string(),
  shape: z.enum(['rectangle', 'polygon']),
  boundary: z.array(latLng),
  farmLat: z.number(),
  farmLng: z.number(),
  displayMode: z.enum(['pin', 'shape']),
  isPositioning: z.boolean(),
  rows: z.array(rowResponseSchema),
  freePlants: z.array(plantResponseSchema),
  plantingEvents: z.array(plantingEventResponseSchema),
  createdAt: isoDate,
  updatedAt: isoDate,
})

export type FieldResponse = z.output<typeof fieldResponseSchema>
export type RowResponse = z.output<typeof rowResponseSchema>
export type PlantResponse = z.output<typeof plantResponseSchema>
export type PlantingEventResponse = z.output<typeof plantingEventResponseSchema>
export type RecommendedOperationResponse = z.output<typeof recommendedOperationResponseSchema>
