import { z } from 'zod'
import { isoDate } from './common'

// ── Crop knowledge base + recipes ("mi calendario para <crop>") ─────────
// A crop's wire shape carries ONE collapsed schedule: the caller's own
// recipe when they have one, else the base recipe (seeded for built-ins,
// the owner's for custom crops). `scheduleSource` tells the UI whether
// "Restaurar calendario original" applies.

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

export const cropScheduleResponseSchema = z.object({
  harvestWindowStartDays: z.number(),
  harvestWindowEndDays: z.number(),
  operations: z.array(opTemplateResponseSchema),
})

export const cropResponseSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  name: z.string(),
  nameEs: z.string(),
  emoji: z.string(),
  category: z.string(),
  isBuiltIn: z.boolean(),
  schedule: cropScheduleResponseSchema.nullable(),
  scheduleSource: z.enum(['user', 'default']).nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
})

export type CropResponse = z.output<typeof cropResponseSchema>

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

export const cropBodyRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  nameEs: z.string().trim().min(1).max(120),
  emoji: z.string().trim().min(1).max(8).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  schedule: scheduleRequestSchema.nullable().optional(),
})

export type ScheduleInput = z.infer<typeof scheduleRequestSchema>
