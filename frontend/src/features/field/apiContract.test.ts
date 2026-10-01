import { describe, it, expectTypeOf } from 'vitest'
import type { z } from 'zod'
import type {
  fieldResponseSchema,
  rowResponseSchema,
  plantResponseSchema,
} from '../../../../backend/src/contracts/fieldContract'
import type { farmResponseSchema } from '../../../../backend/src/contracts/farmContract'
import type { operationResponseSchema } from '../../../../backend/src/contracts/operationContract'
import type { findingResponseSchema } from '../../../../backend/src/contracts/findingContract'
import type { livestockResponseSchema } from '../../../../backend/src/contracts/livestockContract'
import type { harvestResponseSchema } from '../../../../backend/src/contracts/harvestContract'
import type {
  PlacedField, FieldRow, PlantInstance, PlantingEvent, RecommendedOperation,
} from './types'
import type { Farm } from '@/store/useFarmStore'
import type { FarmOperation } from './hooks/useOperationsApi'
import type { Finding } from '@/features/scouting/types'
import type { LivestockUnit } from '@/features/livestock/types'
import type { ApiHarvestRow } from './components/harvestLogSection'

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

  it('server farm response satisfies the frontend Farm', () => {
    expectTypeOf<z.output<typeof farmResponseSchema>>().toMatchTypeOf<Farm>()
  })

  it('server operation response satisfies the frontend FarmOperation', () => {
    expectTypeOf<z.output<typeof operationResponseSchema>>().toMatchTypeOf<FarmOperation>()
  })

  it('server finding response satisfies the frontend Finding', () => {
    expectTypeOf<z.output<typeof findingResponseSchema>>().toMatchTypeOf<Finding>()
  })

  it('server livestock response satisfies the frontend LivestockUnit', () => {
    // animalType widened: the column is free text, the frontend union is
    // the built-in library.
    type WireLivestockUnit = Omit<LivestockUnit, 'animalType'> & { animalType: string }
    expectTypeOf<z.output<typeof livestockResponseSchema>>().toMatchTypeOf<WireLivestockUnit>()
  })

  it('server harvest response satisfies the frontend ApiHarvestRow', () => {
    expectTypeOf<z.output<typeof harvestResponseSchema>>().toMatchTypeOf<ApiHarvestRow>()
  })
})
