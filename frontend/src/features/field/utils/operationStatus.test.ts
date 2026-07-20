import { describe, it, expect } from 'vitest'
import { getFieldOperationHealth } from './operationStatus'
import type { PlantingEvent, RecommendedOperation } from '../types'

function isoDaysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function op(overrides: Partial<RecommendedOperation>): RecommendedOperation {
  return {
    id: 'op1',
    plantingEventId: 'pe1',
    templateId: 't1',
    type: 'fertilization',
    labelEs: 'Fertilización',
    recommendedDate: isoDaysFromToday(0),
    status: 'pending',
    ...overrides,
  }
}

function event(operations: RecommendedOperation[]): PlantingEvent {
  return {
    id: 'pe1',
    fieldId: 'f1',
    cropTypeId: 'plantain',
    plantingDate: isoDaysFromToday(-30),
    plantCount: 10,
    rowIds: [],
    freePlantIds: [],
    operations,
  }
}

describe('getFieldOperationHealth', () => {
  it('returns zeros for no events', () => {
    expect(getFieldOperationHealth([])).toEqual({
      overdue: 0, dueSoon: 0, upcoming: 0, completed: 0,
    })
  })

  it('classifies overdue, due-soon, upcoming, and completed operations', () => {
    const health = getFieldOperationHealth([
      event([
        op({ id: 'a', recommendedDate: isoDaysFromToday(-5) }),          // overdue
        op({ id: 'b', recommendedDate: isoDaysFromToday(7) }),           // due soon
        op({ id: 'c', recommendedDate: isoDaysFromToday(30) }),          // upcoming
        op({ id: 'd', recommendedDate: isoDaysFromToday(-10), status: 'completed' }),
        op({ id: 'e', recommendedDate: isoDaysFromToday(-10), status: 'skipped' }),
      ]),
    ])
    expect(health).toEqual({ overdue: 1, dueSoon: 1, upcoming: 1, completed: 2 })
  })

  it('counts today as due soon, not overdue', () => {
    const health = getFieldOperationHealth([
      event([op({ recommendedDate: isoDaysFromToday(0) })]),
    ])
    expect(health.overdue).toBe(0)
    expect(health.dueSoon).toBe(1)
  })
})
