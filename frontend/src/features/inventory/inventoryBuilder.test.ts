import { describe, it, expect } from 'vitest'
import { buildInventoryRows, summarizeInventory } from './inventoryBuilder'
import type {
  PlacedField, PlantingEvent, RecommendedOperation, OperationStatus,
} from '../field/types'
import type { CropSchedule } from '../field/data/cropSchedules'

const TODAY = '2026-06-15'

function isoFromToday(days: number): string {
  const [y, m, d] = TODAY.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

let seq = 0
function op(overrides: Partial<RecommendedOperation> = {}): RecommendedOperation {
  seq++
  return {
    id: `op-${seq}`,
    plantingEventId: 'ev-1',
    templateId: 'tpl-1',
    type: 'fertilization',
    labelEs: 'Fertilización',
    recommendedDate: TODAY,
    status: 'pending' as OperationStatus,
    ...overrides,
  }
}

function event(overrides: Partial<PlantingEvent> = {}): PlantingEvent {
  seq++
  return {
    id: `ev-${seq}`,
    fieldId: 'f-1',
    cropTypeId: 'plantain',
    plantingDate: isoFromToday(-30),
    plantCount: 25,
    rowIds: ['r-1'],
    freePlantIds: [],
    operations: [],
    ...overrides,
  }
}

function field(events: PlantingEvent[], overrides: Record<string, unknown> = {}): PlacedField {
  return {
    id: 'f-1', farmId: 'farm-1', name: 'Campo Norte', color: '#8fba4e',
    shape: 'rectangle', widthFt: 100, heightFt: 100,
    farmLat: 18.2, farmLng: -66.4, rotation: 0,
    isPositioning: false, displayMode: 'shape',
    rows: [], freePlants: [], plantingEvents: events,
    ...overrides,
  } as unknown as PlacedField
}

const FARMS = [{ id: 'farm-1', name: 'Finca Esperanza' }]

const schedule: CropSchedule = {
  cropTypeId: 'plantain',
  harvestWindowStartDays: 300,
  harvestWindowEndDays: 420,
  operations: [],
}
const getSchedule = (id: string) => (id === 'plantain' ? schedule : undefined)

describe('buildInventoryRows', () => {
  it('creates one row per planting event with farm and field names resolved', () => {
    const fields = [field([event(), event()])]
    const rows = buildInventoryRows(FARMS, fields, TODAY, getSchedule)
    expect(rows).toHaveLength(2)
    expect(rows[0].farmName).toBe('Finca Esperanza')
    expect(rows[0].fieldName).toBe('Campo Norte')
  })

  it('classifies status by worst pending operation', () => {
    const overdue = event({ operations: [op({ recommendedDate: isoFromToday(-2) })] })
    const dueSoon = event({ operations: [op({ recommendedDate: isoFromToday(5) })] })
    const ok = event({ operations: [op({ recommendedDate: isoFromToday(30) })] })
    const done = event({ operations: [op({ status: 'completed' })] })

    const rows = buildInventoryRows(FARMS, [field([overdue, dueSoon, ok, done])], TODAY, getSchedule)
    expect(rows.map(r => r.status)).toEqual(['overdue', 'dueSoon', 'ok', 'done'])
  })

  it('picks the earliest pending operation as nextOp, skipping completed ones', () => {
    const ev = event({
      operations: [
        op({ labelEs: 'Ya hecha', recommendedDate: isoFromToday(-10), status: 'completed' }),
        op({ labelEs: 'Más tarde', recommendedDate: isoFromToday(20) }),
        op({ labelEs: 'La próxima', recommendedDate: isoFromToday(3) }),
      ],
    })
    const rows = buildInventoryRows(FARMS, [field([ev])], TODAY, getSchedule)
    expect(rows[0].nextOp?.labelEs).toBe('La próxima')
    expect(rows[0].nextOp?.daysFromToday).toBe(3)
  })

  it('projects the harvest window from the crop schedule and planting date', () => {
    const ev = event({ plantingDate: '2026-01-01' })
    const rows = buildInventoryRows(FARMS, [field([ev])], TODAY, getSchedule)
    expect(rows[0].harvestWindow).toEqual({
      start: '2026-10-28', // 2026-01-01 + 300 days
      end: '2027-02-25',   // 2026-01-01 + 420 days
    })
  })

  it('returns null harvest window for crops without a schedule', () => {
    const ev = event({ cropTypeId: 'guava' })
    const rows = buildInventoryRows(FARMS, [field([ev])], TODAY, getSchedule)
    expect(rows[0].harvestWindow).toBeNull()
  })

  it('detects the planting source from row/plant ids', () => {
    const rowsOnly = event({ rowIds: ['r-1'], freePlantIds: [] })
    const plantsOnly = event({ rowIds: [], freePlantIds: ['p-1'] })
    const mixed = event({ rowIds: ['r-1'], freePlantIds: ['p-1'] })
    const rows = buildInventoryRows(FARMS, [field([rowsOnly, plantsOnly, mixed])], TODAY, getSchedule)
    expect(rows.map(r => r.source)).toEqual(['rows', 'plants', 'mixed'])
  })

  it('counts pending, overdue and completed operations', () => {
    const ev = event({
      operations: [
        op({ recommendedDate: isoFromToday(-3) }),
        op({ recommendedDate: isoFromToday(2) }),
        op({ status: 'completed' }),
        op({ status: 'skipped' }),
      ],
    })
    const rows = buildInventoryRows(FARMS, [field([ev])], TODAY, getSchedule)
    expect(rows[0].pendingOpsCount).toBe(2)
    expect(rows[0].overdueOpsCount).toBe(1)
    expect(rows[0].completedOpsCount).toBe(2)
  })

  it('computes age in days from the planting date', () => {
    const ev = event({ plantingDate: isoFromToday(-45) })
    const rows = buildInventoryRows(FARMS, [field([ev])], TODAY, getSchedule)
    expect(rows[0].ageDays).toBe(45)
  })

  it('keeps fields whose farm is unknown instead of dropping them', () => {
    const orphan = field([event()], { farmId: 'missing-farm' })
    const rows = buildInventoryRows(FARMS, [orphan], TODAY, getSchedule)
    expect(rows).toHaveLength(1)
    expect(rows[0].farmName).toBe('—')
  })
})

describe('summarizeInventory', () => {
  it('rolls up plantings, plants, crops and operation counts', () => {
    const fields = [field([
      event({ plantCount: 10, operations: [op({ recommendedDate: isoFromToday(-1) })] }),
      event({ plantCount: 5, cropTypeId: 'coffee', operations: [op({ recommendedDate: isoFromToday(3) })] }),
    ])]
    const summary = summarizeInventory(buildInventoryRows(FARMS, fields, TODAY, getSchedule))
    expect(summary).toEqual({ plantings: 2, plants: 15, overdue: 1, pending: 2, crops: 2 })
  })
})
