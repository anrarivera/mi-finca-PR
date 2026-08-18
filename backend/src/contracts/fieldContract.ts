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
  // The recipe version this planting followed (Recetas de Cultivo R3) —
  // the stamped operations below are a copy; this reference is for proof.
  recipeVersionId: z.string().nullable(),
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

// ── Request bodies ──────────────────────────────────────────────────────
// Liberal on purpose (loose objects — unknown keys pass through): requests
// are validated for the structure and types of everything the server
// READS. The Spanish domain guards (name lengths, quantity caps, geometry
// bounds, farm containment) still run after this structural gate.

const plantRequest = z.looseObject({
  id: z.string(),
  cropTypeId: z.string(),
  lat: z.number(),
  lng: z.number(),
  plantingDate: z.string().min(1),
})

const rowRequest = z.looseObject({
  id: z.string(),
  startLat: z.number(),
  startLng: z.number(),
  endLat: z.number(),
  endLng: z.number(),
  spacingFt: z.number(),
  primaryCropTypeId: z.string(),
  companionCropTypeId: z.string().nullish(),
  plantingDate: z.string().min(1),
  path: z.array(latLng).nullish(),
  pathClosed: z.boolean().nullish(),
  plants: z.array(plantRequest).optional(),
})

// Round-tripped calendar entries (client-generated ids; status and the
// completed-operation link must survive re-saves).
const eventOperationRequest = z.looseObject({
  id: z.string(),
  templateId: z.string(),
  type: z.string(),
  labelEs: z.string(),
  recommendedDate: z.string().min(1),
  status: z.string().optional(),
  completedDate: z.string().nullish(),
  completedOperationId: z.string().nullish(),
  notes: z.string().nullish(),
  product: z.string().nullish(),
  quantity: z.number().nullish(),
  unit: z.string().nullish(),
})

const plantingEventRequest = z.looseObject({
  id: z.string(),
  cropTypeId: z.string(),
  plantingDate: z.string().min(1),
  plantCount: z.number(),
  isSimulated: z.boolean().optional(),
  recipeVersionId: z.string().nullish(),
  rowIds: z.array(z.string()).optional(),
  freePlantIds: z.array(z.string()).optional(),
  operations: z.array(eventOperationRequest).optional(),
})

export const createFieldRequestSchema = z.looseObject({
  name: z.string().min(1),
  kind: z.enum(['crops', 'livestock']).optional(),
  color: z.string().min(1),
  shape: z.enum(['rectangle', 'polygon']),
  boundary: z.array(latLng).optional(),
  farmLat: z.number(),
  farmLng: z.number(),
  displayMode: z.enum(['pin', 'shape']).optional(),
  isPositioning: z.boolean().optional(),
  isSimulated: z.boolean().optional(),
  farmModelId: z.string().nullish(),
  rows: z.array(rowRequest).optional(),
  freePlants: z.array(plantRequest).optional(),
  plantingEvents: z.array(plantingEventRequest).optional(),
})

export const updateFieldRequestSchema = createFieldRequestSchema.partial()
