import { describe, it, expect } from 'vitest'
import { liftScheduleFromPlanting } from './recipeLift'
import type { PlantingEvent, RecommendedOperation } from '../types'

// ── "Guardar como receta" derivation ────────────────────────────────────
// Real offsets from what actually happened: completed ops use their
// completedDate, pending ops keep the plan, skipped ops are excluded.

function op(overrides: Partial<RecommendedOperation>): RecommendedOperation {
  return {
    id: 'op1', plantingEventId: 'pe1', templateId: 'tpl1',
    type: 'fertilization', labelEs: 'Abono',
    recommendedDate: '2026-07-01', status: 'pending',
    ...overrides,
  }
}

function event(operations: RecommendedOperation[]): PlantingEvent {
  return {
    id: 'pe1', fieldId: 'f1', cropTypeId: 'plantain',
    plantingDate: '2026-06-01', plantCount: 10,
    rowIds: [], freePlantIds: [], operations,
  }
}

describe('liftScheduleFromPlanting', () => {
  it('uses the REAL offset for completed ops and the planned one for pending', () => {
    const lifted = liftScheduleFromPlanting(event([
      // Planned day 30, actually done day 45 — the recipe records reality.
      op({ id: 'a', templateId: 'a', status: 'completed', recommendedDate: '2026-07-01', completedDate: '2026-07-16' }),
      op({ id: 'b', templateId: 'b', type: 'monitoring', labelEs: 'Monitoreo', status: 'pending', recommendedDate: '2026-08-01' }),
    ]))!
    expect(lifted.draft.ops.map(o => o.offsetDays)).toEqual(['45', '61'])
    expect(lifted.liftedCount).toBe(2)
  })

  it('excludes skipped ops and counts them', () => {
    const lifted = liftScheduleFromPlanting(event([
      op({ id: 'a', templateId: 'a', status: 'completed', completedDate: '2026-06-15' }),
      op({ id: 'b', templateId: 'b', status: 'skipped', labelEs: 'Fumigación' }),
    ]))!
    expect(lifted.draft.ops).toHaveLength(1)
    expect(lifted.skippedCount).toBe(1)
  })

  it('derives the harvest window from real harvest offsets', () => {
    const lifted = liftScheduleFromPlanting(event([
      op({ id: 'a', templateId: 'a', status: 'completed', completedDate: '2026-06-20' }),
      op({ id: 'h1', templateId: 'h1', type: 'harvest', labelEs: 'Cosecha', status: 'completed', recommendedDate: '2027-03-01', completedDate: '2027-03-10' }),
      op({ id: 'h2', templateId: 'h2', type: 'harvest', labelEs: 'Segunda cosecha', status: 'completed', recommendedDate: '2027-04-01', completedDate: '2027-04-20' }),
    ]))!
    expect(lifted.draft.windowStart).toBe('282') // 2026-06-01 → 2027-03-10
    expect(lifted.draft.windowEnd).toBe('323')   // 2026-06-01 → 2027-04-20
  })

  it('falls back to the last offset when no harvest op exists', () => {
    const lifted = liftScheduleFromPlanting(event([
      op({ id: 'a', templateId: 'a', status: 'completed', completedDate: '2026-06-15' }),
      op({ id: 'b', templateId: 'b', status: 'completed', completedDate: '2026-08-01', labelEs: 'Segundo abono' }),
    ]))!
    expect(lifted.draft.windowStart).toBe('61')
    expect(lifted.draft.windowEnd).toBe('61')
  })

  it('clamps a pre-planting correction to day 0 and sorts by offset', () => {
    const lifted = liftScheduleFromPlanting(event([
      op({ id: 'b', templateId: 'b', status: 'completed', completedDate: '2026-07-01', labelEs: 'Tarde' }),
      op({ id: 'a', templateId: 'a', status: 'completed', completedDate: '2026-05-20', labelEs: 'Temprano' }),
    ]))!
    expect(lifted.draft.ops.map(o => [o.labelEs, o.offsetDays])).toEqual([
      ['Temprano', '0'], ['Tarde', '30'],
    ])
  })

  it('carries products through and omits template ids (server mints fresh ones)', () => {
    const lifted = liftScheduleFromPlanting(event([
      op({ id: 'a', templateId: 'a', status: 'completed', completedDate: '2026-06-15', product: 'Abono 10-10-10' }),
    ]))!
    expect(lifted.draft.ops[0].product).toBe('Abono 10-10-10')
    expect(lifted.draft.ops[0].id).toBeUndefined()
  })

  it('returns null when nothing is liftable', () => {
    expect(liftScheduleFromPlanting(event([]))).toBeNull()
    expect(liftScheduleFromPlanting(event([op({ status: 'skipped' })]))).toBeNull()
  })
})
