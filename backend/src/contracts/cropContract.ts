import { z } from 'zod'
import { isoDate } from './common'

// ── Crops are IDENTITY — name, emoji, category. Practice (schedules,
// harvest windows, operation templates) lives on recipes; see
// recipeContract.ts. Built-ins are seeded rows anyone can read; custom
// crops belong to their creator and are private until canonicalized.

export const cropResponseSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  name: z.string(),
  nameEs: z.string(),
  emoji: z.string(),
  category: z.string(),
  isBuiltIn: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
})

export type CropResponse = z.output<typeof cropResponseSchema>

// ── Request bodies ──────────────────────────────────────────────────────

export const cropBodyRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  nameEs: z.string().trim().min(1).max(120),
  emoji: z.string().trim().min(1).max(8).optional(),
  category: z.string().trim().min(1).max(60).optional(),
})
