import { describe, it, expectTypeOf } from 'vitest'
import type { z } from 'zod'
import type {
  fieldResponseSchema,
  rowResponseSchema,
  plantResponseSchema,
} from '../../../../backend/src/contracts/fieldContract'
import type {
  PlacedField, FieldRow, PlantInstance, PlantingEvent, RecommendedOperation,
} from './types'

// ──────────────────────────────────────────────────────────────────────────
// Compile-time contract test. The backend's zod schema is the single
// authority on what a field response contains; this file asserts the
// frontend's hand-written types stay ASSIGNABLE from it. If either side
// drifts — a field renamed, a null introduced, a key dropped — this fails
// to typecheck, in CI, before any farmer sees the mismatch.
// (Type-only imports: nothing from the backend lands in the bundle.)
// ──────────────────────────────────────────────────────────────────────────

type FieldResponse = z.output<typeof fieldResponseSchema>
type RowResponse = z.output<typeof rowResponseSchema>
type PlantResponse = z.output<typeof plantResponseSchema>

// One deliberate widening: the server ships operation `type` as string —
// custom crops define their own operation types, so the frontend's
// built-in RecommendedOperationType union is narrower than reality.
type WireRecommendedOperation = Omit<RecommendedOperation, 'type'> & { type: string }
type WirePlantingEvent = Omit<PlantingEvent, 'operations'> & {
  operations: WireRecommendedOperation[]
}
type WirePlacedField = Omit<PlacedField, 'plantingEvents'> & {
  plantingEvents: WirePlantingEvent[]
}

describe('field API contract', () => {
  it('server plant response satisfies the frontend PlantInstance', () => {
    expectTypeOf<PlantResponse>().toMatchTypeOf<PlantInstance>()
  })

  it('server row response satisfies the frontend FieldRow', () => {
    expectTypeOf<RowResponse>().toMatchTypeOf<FieldRow>()
  })

  it('server field response satisfies the frontend PlacedField', () => {
    expectTypeOf<FieldResponse>().toMatchTypeOf<WirePlacedField>()
  })
})
