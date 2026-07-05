import { describe, it, expect } from 'vitest'
import {
  buildNotifications,
  formatRelativeDaysEs,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from './notificationBuilder'
import type {
  PlacedField, PlantingEvent, RecommendedOperation, OperationStatus,
} from '../field/types'

const TODAY = '2026-06-15'

/** ISO date `days` away from the fixed TODAY used in these tests. */
function isoFromToday(days: number): string {
  const [y, m, d] = TODAY.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

let opSeq = 0
function op(overrides: Partial<RecommendedOperation> = {}): RecommendedOperation {
  opSeq++
  return {
    id: `op-${opSeq}`,
    plantingEventId: 'ev-1',
    templateId: 'tpl-1',
    type: 'fertilization',
    labelEs: 'Fertilización',
    recommendedDate: TODAY,
    status: 'pending' as OperationStatus,
    ...overrides,
  }
}

function fieldWith(ops: RecommendedOperation[], name = 'Campo 1'): PlacedField {
  const event: PlantingEvent = {
    id: 'ev-1',
    fieldId: 'f-1',
    cropTypeId: 'plantain',
    plantingDate: isoFromToday(-30),
    plantCount: 10,
    rowIds: [],
    freePlantIds: [],
    operations: ops,
  }
  return {
    id: 'f-1', farmId: 'farm-1', name, color: '#8fba4e',
    shape: 'rectangle', widthFt: 100, heightFt: 100,
    farmLat: 18.2, farmLng: -66.4, rotation: 0,
    isPositioning: false, displayMode: 'shape',
    rows: [], freePlants: [], plantingEvents: [event],
  } as unknown as PlacedField
}

const prefs = (overrides: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  ...DEFAULT_NOTIFICATION_PREFS,
  ...overrides,
})

describe('buildNotifications', () => {
  it('returns nothing when the master switch is off', () => {
    const fields = [fieldWith([op({ recommendedDate: isoFromToday(-3) })])]
    expect(buildNotifications(fields, prefs({ enabled: false }), TODAY)).toEqual([])
  })

  it('classifies past-due operations as overdue with negative day counts', () => {
    const fields = [fieldWith([op({ recommendedDate: isoFromToday(-3) })])]
    const result = buildNotifications(fields, prefs(), TODAY)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('overdue')
    expect(result[0].daysFromToday).toBe(-3)
  })

  it('counts today as due-soon, not overdue (same rule as getFieldOperationHealth)', () => {
    const fields = [fieldWith([op({ recommendedDate: TODAY })])]
    const result = buildNotifications(fields, prefs(), TODAY)
    expect(result[0].kind).toBe('dueSoon')
    expect(result[0].daysFromToday).toBe(0)
  })

  it('includes operations within the lead window and skips those beyond it', () => {
    const fields = [fieldWith([
      op({ recommendedDate: isoFromToday(14) }),
      op({ recommendedDate: isoFromToday(15) }),
    ])]
    const result = buildNotifications(fields, prefs({ dueSoonLeadDays: 14 }), TODAY)
    expect(result).toHaveLength(1)
    expect(result[0].daysFromToday).toBe(14)
  })

  it('ignores completed and skipped operations', () => {
    const fields = [fieldWith([
      op({ recommendedDate: isoFromToday(-5), status: 'completed' }),
      op({ recommendedDate: isoFromToday(-5), status: 'skipped' }),
    ])]
    expect(buildNotifications(fields, prefs(), TODAY)).toEqual([])
  })

  it('routes harvest operations through the harvest toggle exclusively', () => {
    const harvestOp = op({ type: 'harvest', recommendedDate: isoFromToday(-2) })
    const fields = [fieldWith([harvestOp])]

    const withHarvest = buildNotifications(fields, prefs(), TODAY)
    expect(withHarvest[0].kind).toBe('harvest')

    // Even though it is overdue and notifyOverdue is on, the harvest toggle wins.
    const without = buildNotifications(fields, prefs({ notifyHarvest: false }), TODAY)
    expect(without).toEqual([])
  })

  it('respects the overdue and due-soon toggles independently', () => {
    const fields = [fieldWith([
      op({ recommendedDate: isoFromToday(-1) }),
      op({ recommendedDate: isoFromToday(3) }),
    ])]
    const noOverdue = buildNotifications(fields, prefs({ notifyOverdue: false }), TODAY)
    expect(noOverdue.map(n => n.kind)).toEqual(['dueSoon'])

    const noDueSoon = buildNotifications(fields, prefs({ notifyDueSoon: false }), TODAY)
    expect(noDueSoon.map(n => n.kind)).toEqual(['overdue'])
  })

  it('sorts most-overdue first, then soonest upcoming', () => {
    const fields = [fieldWith([
      op({ recommendedDate: isoFromToday(5) }),
      op({ recommendedDate: isoFromToday(-10) }),
      op({ recommendedDate: isoFromToday(0) }),
    ])]
    const result = buildNotifications(fields, prefs(), TODAY)
    expect(result.map(n => n.daysFromToday)).toEqual([-10, 0, 5])
  })
})

describe('formatRelativeDaysEs', () => {
  it('covers today, tomorrow, yesterday, and plural forms', () => {
    expect(formatRelativeDaysEs(0)).toBe('hoy')
    expect(formatRelativeDaysEs(1)).toBe('mañana')
    expect(formatRelativeDaysEs(-1)).toBe('ayer')
    expect(formatRelativeDaysEs(-4)).toBe('hace 4 días')
    expect(formatRelativeDaysEs(9)).toBe('en 9 días')
  })
})
