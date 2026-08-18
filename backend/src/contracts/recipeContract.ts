import { z } from 'zod'
import { isoDate } from './common'

// ── Recipes: user-authored practice per crop, versioned, with proof ─────
// Crops are identity; recipes are practice. See the Recetas de Cultivo
// design doc: versions freeze once a planting references them (R1), and
// the resolved endpoint materializes the R2 ladder for a farm.

export const opTemplateResponseSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string().optional(),
  labelEs: z.string(),
  offsetDays: z.number(),
  notes: z.string().optional(),
  notesEs: z.string().optional(),
  product: z.string().optional(),
})

export const recipeVersionResponseSchema = z.object({
  id: z.string(),
  number: z.number(),
  harvestWindowStartDays: z.number(),
  harvestWindowEndDays: z.number(),
  operations: z.array(opTemplateResponseSchema),
  note: z.string().nullable(),
  referenced: z.boolean(),
  createdAt: isoDate,
})

export const recipeResponseSchema = z.object({
  id: z.string(),
  authorUserId: z.string().nullable(), // null = seeded system recipe
  cropTypeId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  visibility: z.string(),
  archived: z.boolean(),
  currentVersion: recipeVersionResponseSchema.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
})

export type RecipeResponse = z.output<typeof recipeResponseSchema>

// One row of the materialized R2 ladder: fieldId null = the farm-level
// resolution (farm default → owner's personal default → system recipe);
// fieldId set = an explicit field default that wins inside that field.
export const resolvedRecipeEntrySchema = z.object({
  cropTypeId: z.string(),
  fieldId: z.string().nullable(),
  recipeId: z.string(),
  recipeName: z.string(),
  authorUserId: z.string().nullable(),
  versionId: z.string(),
  versionNumber: z.number(),
  harvestWindowStartDays: z.number(),
  harvestWindowEndDays: z.number(),
  operations: z.array(opTemplateResponseSchema),
})

export type ResolvedRecipeEntry = z.output<typeof resolvedRecipeEntrySchema>

export const resolvedRecipesResponseSchema = z.object({
  farmId: z.string(),
  entries: z.array(resolvedRecipeEntrySchema),
})

export type ResolvedRecipesResponse = z.output<typeof resolvedRecipesResponseSchema>

// ── Request bodies ──────────────────────────────────────────────────────

export const opTemplateRequestSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  type: z.enum(['fertilization', 'spray', 'cultivation', 'irrigation', 'monitoring', 'harvest']),
  label: z.string().trim().max(200).optional(),
  labelEs: z.string().trim().min(1).max(200),
  offsetDays: z.number().int().min(0).max(3650),
  notes: z.string().trim().max(1000).optional(),
  notesEs: z.string().trim().max(1000).optional(),
  product: z.string().trim().max(200).optional(),
})

export const scheduleRequestSchema = z.object({
  harvestWindowStartDays: z.number().int().min(0).max(36500),
  harvestWindowEndDays: z.number().int().min(0).max(36500),
  operations: z.array(opTemplateRequestSchema).max(100),
}).refine(s => s.harvestWindowEndDays >= s.harvestWindowStartDays, {
  message: 'harvestWindowEndDays must be greater than or equal to harvestWindowStartDays',
})

export type ScheduleInput = z.infer<typeof scheduleRequestSchema>

export const createRecipeRequestSchema = z.object({
  cropTypeId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  schedule: scheduleRequestSchema,
})

export const updateRecipeRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullish(),
})

export const updateRecipeScheduleRequestSchema = z.object({
  schedule: scheduleRequestSchema,
  note: z.string().trim().max(500).nullish(),
})

export const setRecipeDefaultRequestSchema = z.object({
  cropTypeId: z.string().trim().min(1),
  // null clears the default at this scope.
  recipeId: z.string().trim().min(1).nullable(),
  scope: z.enum(['user', 'farm', 'field']),
  farmId: z.string().trim().min(1).optional(),
  fieldId: z.string().trim().min(1).optional(),
})
