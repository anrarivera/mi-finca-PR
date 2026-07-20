import { describe, it, expect } from 'vitest'
import { collectHarvestEntries, totalHarvestsByCrop } from './harvestLog'
import type { PlacedField, RecommendedOperation } from '../types'

function op(overrides: Partial<RecommendedOperation>): RecommendedOperation {
  return {
    id: 'op1',
    plantingEventId: 'pe1',
    templateId: 't1',
    type: 'harvest',
    labelEs: 'Cosecha',
    recommendedDate: '2026-06-01',
    status: 'completed',
    ...overrides,
  }
}

function field(operations: RecommendedOperation[]): PlacedField {
  return {
    id: 'f1', farmId: 'farm1', name: 'Campo 1', color: '#639922',
    shape: 'rectangle', widthFt: 100, heightFt: 100, boundary: [],
    farmLat: 18.2, farmLng: -66.6, rotation: 0, isPositioning: false,
    displayMode: 'shape', rows: [], freePlants: [],
    plantingEvents: [{
      id: 'pe1', fieldId: 'f1', cropTypeId: 'plantain',
      plantingDate: '2026-01-01', plantCount: 10, rowIds: [], freePlantIds: [],
      operations,
    }],
  } as PlacedField
}

describe('collectHarvestEntries', () => {
  it('includes only completed harvest operations', () => {
    const entries = collectHarvestEntries([field([
      op({ id: 'a', completedDate: '2026-06-05', quantity: 100, unit: 'lbs' }),
      op({ id: 'b', status: 'pending' }),                       // not completed
      op({ id: 'c', type: 'fertilization', status: 'completed' }), // not harvest
    ])])
    expect(entries).toHaveLength(1)
    expect(entries[0].date).toBe('2026-06-05')
    expect(entries[0].cropTypeId).toBe('plantain')
  })

  it('sorts newest first and falls back to recommendedDate', () => {
    const entries = collectHarvestEntries([field([
      op({ id: 'a', completedDate: '2026-06-01' }),
      op({ id: 'b' }), // no completedDate → recommendedDate 2026-06-01... use later one
      op({ id: 'c', completedDate: '2026-07-10' }),
    ])])
    expect(entries[0].operationId).toBe('c')
  })
})

describe('totalHarvestsByCrop', () => {
  it('sums quantities per unit and defaults the unit to lbs', () => {
    const entries = collectHarvestEntries([field([
      op({ id: 'a', completedDate: '2026-06-01', quantity: 100, unit: 'lbs' }),
      op({ id: 'b', completedDate: '2026-06-15', quantity: 50 }),        // no unit → lbs
      op({ id: 'c', completedDate: '2026-06-20', quantity: 4, unit: 'cajas' }),
      op({ id: 'd', completedDate: '2026-06-21' }),                       // no quantity
    ])])
    const [total] = totalHarvestsByCrop(entries)
    expect(total.cropTypeId).toBe('plantain')
    expect(total.harvests).toBe(4)
    expect(total.totalsByUnit).toEqual({ lbs: 150, cajas: 4 })
  })
})
