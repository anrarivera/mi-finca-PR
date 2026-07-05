import { describe, it, expect } from 'vitest'
import {
  processRowForEvents,
  processFreePlantsForEvents,
  rebuildPlantingEvents,
  refreshOperationStatuses,
} from './plantingEventManager'
import type { FieldRow, PlantInstance, PlantingEvent } from '../types'

function makePlant(id: string, cropTypeId: string, plantingDate: string): PlantInstance {
  return { id, cropTypeId, lat: 18.22, lng: -66.59, plantingDate }
}

function makeRow(id: string, cropTypeId: string, plantingDate: string, plantCount: number): FieldRow {
  return {
    id,
    startLat: 18.22, startLng: -66.59,
    endLat: 18.221, endLng: -66.589,
    spacingFt: 3,
    primaryCropTypeId: cropTypeId,
    companionCropTypeId: null,
    plantingDate,
    plants: Array.from({ length: plantCount }, (_, i) =>
      makePlant(`${id}_p${i}`, cropTypeId, plantingDate)
    ),
  }
}

describe('processRowForEvents', () => {
  it('creates a planting event with the crop schedule for a new row', () => {
    const row = makeRow('r1', 'plantain', '2026-06-01', 5)
    const events = processRowForEvents([], 'f1', row)
    expect(events).toHaveLength(1)
    expect(events[0].cropTypeId).toBe('plantain')
    expect(events[0].plantCount).toBe(5)
    expect(events[0].rowIds).toEqual(['r1'])
    expect(events[0].operations.length).toBeGreaterThan(0)
  })

  it('merges rows with the same crop and planting date into one event', () => {
    const r1 = makeRow('r1', 'plantain', '2026-06-01', 5)
    const r2 = makeRow('r2', 'plantain', '2026-06-01', 7)
    let events = processRowForEvents([], 'f1', r1)
    events = processRowForEvents(events, 'f1', r2)
    expect(events).toHaveLength(1)
    expect(events[0].plantCount).toBe(12)
    expect(events[0].rowIds).toEqual(['r1', 'r2'])
  })

  it('keeps separate events for different planting dates', () => {
    const r1 = makeRow('r1', 'plantain', '2026-06-01', 5)
    const r2 = makeRow('r2', 'plantain', '2026-07-01', 7)
    let events = processRowForEvents([], 'f1', r1)
    events = processRowForEvents(events, 'f1', r2)
    expect(events).toHaveLength(2)
  })

  it('offsets operation dates by pure calendar arithmetic', () => {
    // plantain's first operation is at offset 14 days; crossing a US DST
    // boundary (2026-03-08) must not shift the date.
    const row = makeRow('r1', 'plantain', '2026-03-01', 3)
    const [event] = processRowForEvents([], 'f1', row)
    expect(event.operations[0].recommendedDate).toBe('2026-03-15')
  })

  it('merges companion plants into the companion event, not the primary', () => {
    // Two rows, same date: plantain primary with marigold companion.
    // Regression: the old merge path added row 2's companion plants to the
    // PRIMARY event's count and never updated the companion event.
    const makeCompanionRow = (id: string) => {
      const row = makeRow(id, 'plantain', '2026-06-01', 4)
      row.companionCropTypeId = 'marigold'
      row.plants = row.plants.map((p, i) =>
        i % 2 !== 0 ? { ...p, cropTypeId: 'marigold' } : p
      ) // 2 plantain + 2 marigold per row
      return row
    }
    let events = processRowForEvents([], 'f1', makeCompanionRow('r1'))
    events = processRowForEvents(events, 'f1', makeCompanionRow('r2'))

    expect(events).toHaveLength(2)
    const plantain = events.find(e => e.cropTypeId === 'plantain')!
    const marigold = events.find(e => e.cropTypeId === 'marigold')!
    expect(plantain.plantCount).toBe(4) // 2 per row × 2 rows — primary only
    expect(marigold.plantCount).toBe(4)
    expect(marigold.rowIds).toEqual(['r1', 'r2'])
  })
})

describe('processFreePlantsForEvents', () => {
  it('groups free plants by crop into events', () => {
    const plants = [
      makePlant('p1', 'mango', '2026-06-01'),
      makePlant('p2', 'mango', '2026-06-01'),
      makePlant('p3', 'coffee', '2026-06-01'),
    ]
    const events = processFreePlantsForEvents([], 'f1', plants, '2026-06-01')
    expect(events).toHaveLength(2)
    const mango = events.find(e => e.cropTypeId === 'mango')!
    expect(mango.plantCount).toBe(2)
    expect(mango.freePlantIds).toEqual(['p1', 'p2'])
  })
})

describe('rebuildPlantingEvents', () => {
  it('drops events for removed rows', () => {
    const r1 = makeRow('r1', 'plantain', '2026-06-01', 5)
    const r2 = makeRow('r2', 'tomato', '2026-06-01', 4)
    let events: PlantingEvent[] = []
    events = processRowForEvents(events, 'f1', r1)
    events = processRowForEvents(events, 'f1', r2)
    expect(events).toHaveLength(2)

    // Rebuild with only r1 remaining
    const rebuilt = rebuildPlantingEvents('f1', [r1], [], events)
    expect(rebuilt).toHaveLength(1)
    expect(rebuilt[0].cropTypeId).toBe('plantain')
  })

  it('preserves completed operation status across rebuilds', () => {
    const r1 = makeRow('r1', 'plantain', '2026-06-01', 5)
    let events = processRowForEvents([], 'f1', r1)
    const completedTemplate = events[0].operations[0].templateId
    events = [{
      ...events[0],
      operations: events[0].operations.map((op, i) =>
        i === 0
          ? { ...op, status: 'completed' as const, completedDate: '2026-06-20', product: 'Abono 10-10-10' }
          : op
      ),
    }]

    // Edit the row (more plants), then rebuild
    const edited = makeRow('r1', 'plantain', '2026-06-01', 9)
    const rebuilt = rebuildPlantingEvents('f1', [edited], [], events)
    expect(rebuilt).toHaveLength(1)
    expect(rebuilt[0].plantCount).toBe(9)
    const carried = rebuilt[0].operations.find(op => op.templateId === completedTemplate)!
    expect(carried.status).toBe('completed')
    expect(carried.completedDate).toBe('2026-06-20')
    expect(carried.product).toBe('Abono 10-10-10')
  })

  it('groups by each plant\'s actual crop, so a recropped plant moves events', () => {
    // A row of 4 plantain where one plant was individually recropped to
    // mango must produce a 3-plant plantain event and a 1-plant mango event.
    const row = makeRow('r1', 'plantain', '2026-06-01', 4)
    row.plants[2] = { ...row.plants[2], cropTypeId: 'mango' }
    const rebuilt = rebuildPlantingEvents('f1', [row], [], [])
    const plantain = rebuilt.find(e => e.cropTypeId === 'plantain')!
    const mango = rebuilt.find(e => e.cropTypeId === 'mango')!
    expect(plantain.plantCount).toBe(3)
    expect(mango.plantCount).toBe(1)
    expect(mango.operations.length).toBeGreaterThan(0)
  })

  it('drops individually deleted plants from event counts', () => {
    const row = makeRow('r1', 'plantain', '2026-06-01', 5)
    row.plants = row.plants.filter((_, i) => i !== 0) // one plant deleted
    const rebuilt = rebuildPlantingEvents('f1', [row], [], [])
    expect(rebuilt[0].plantCount).toBe(4)
  })

  it('keeps completed harvest history when the row is deleted', () => {
    // Harvest checked off with quantity, then the spent row is removed:
    // the event must survive as history (it backs the harvest log), keeping
    // only its completed/skipped operations.
    const row = makeRow('r1', 'plantain', '2020-01-01', 5)
    const [event] = processRowForEvents([], 'f1', row)
    const harvested: PlantingEvent = {
      ...event,
      operations: event.operations.map(op =>
        op.type === 'harvest'
          ? { ...op, status: 'completed' as const, completedDate: '2020-10-01', quantity: 250, unit: 'lbs' }
          : op
      ),
    }

    const rebuilt = rebuildPlantingEvents('f1', [], [], [harvested])
    expect(rebuilt).toHaveLength(1)
    const ops = rebuilt[0].operations
    expect(ops.length).toBeGreaterThan(0)
    expect(ops.every(op => op.status === 'completed' || op.status === 'skipped')).toBe(true)
    const harvest = ops.find(op => op.type === 'harvest')!
    expect(harvest.quantity).toBe(250)
  })

  it('drops vanished events that have no completed work', () => {
    const row = makeRow('r1', 'plantain', '2026-06-01', 5)
    const [event] = processRowForEvents([], 'f1', row) // all ops pending/due
    const rebuilt = rebuildPlantingEvents('f1', [], [], [event])
    expect(rebuilt).toHaveLength(0)
  })

  it('restores the schedule when replanting into a history-only event', () => {
    // Harvest a row, delete it (event survives as history with only its
    // completed ops), then plant a NEW row with the same crop + date: the
    // merged event must regain its pending schedule operations.
    const row = makeRow('r1', 'plantain', '2020-01-01', 5)
    const [event] = processRowForEvents([], 'f1', row)
    const harvested: PlantingEvent = {
      ...event,
      operations: event.operations.map(op =>
        op.type === 'harvest'
          ? { ...op, status: 'completed' as const, completedDate: '2020-10-01', quantity: 100 }
          : op
      ),
    }
    const [ghost] = rebuildPlantingEvents('f1', [], [], [harvested])
    expect(ghost.operations.every(op => op.status === 'completed' || op.status === 'skipped')).toBe(true)

    const replant = makeRow('r2', 'plantain', '2020-01-01', 3)
    const merged = processRowForEvents([ghost], 'f1', replant)
    expect(merged).toHaveLength(1)
    // Completed harvest record survives…
    const harvest = merged[0].operations.find(op => op.type === 'harvest' && op.status === 'completed')!
    expect(harvest.quantity).toBe(100)
    // …and the stripped schedule operations are back.
    expect(merged[0].operations.length).toBe(event.operations.length)
    expect(merged[0].operations.some(op => op.status !== 'completed' && op.status !== 'skipped')).toBe(true)
    // The count reflects the plants that exist NOW (3), not the ghost's
    // removed plants stacked with the new ones (5 + 3 = 8).
    expect(merged[0].plantCount).toBe(3)
    expect(merged[0].rowIds).toEqual(['r2'])

    // The rebuild path (what the editor hook actually uses) agrees.
    const rebuilt = rebuildPlantingEvents('f1', [replant], [], [ghost])
    expect(rebuilt).toHaveLength(1)
    expect(rebuilt[0].plantCount).toBe(3)
    expect(rebuilt[0].operations.find(op => op.type === 'harvest')!.status).toBe('completed')
  })

  it('keeps history when a planting date is corrected', () => {
    const row = makeRow('r1', 'plantain', '2026-05-01', 5)
    const [event] = processRowForEvents([], 'f1', row)
    const withDone: PlantingEvent = {
      ...event,
      operations: event.operations.map((op, i) =>
        i === 0 ? { ...op, status: 'completed' as const, completedDate: '2026-05-20' } : op
      ),
    }

    // Date corrected → group key changes → old event survives as history,
    // new event gets a fresh schedule.
    const edited = makeRow('r1', 'plantain', '2026-06-01', 5)
    const rebuilt = rebuildPlantingEvents('f1', [edited], [], [withDone])
    expect(rebuilt).toHaveLength(2)
    const history = rebuilt.find(e => e.plantingDate === '2026-05-01')!
    expect(history.operations).toHaveLength(1)
    expect(history.operations[0].status).toBe('completed')
    const fresh = rebuilt.find(e => e.plantingDate === '2026-06-01')!
    expect(fresh.operations.length).toBeGreaterThan(1)
  })
})

describe('refreshOperationStatuses', () => {
  it('marks past pending operations as due and leaves completed untouched', () => {
    const row = makeRow('r1', 'plantain', '2020-01-01', 3) // long past
    const [event] = processRowForEvents([], 'f1', row)
    const withCompleted: PlantingEvent = {
      ...event,
      operations: event.operations.map((op, i) =>
        i === 0 ? { ...op, status: 'completed' as const } : { ...op, status: 'pending' as const }
      ),
    }
    const [refreshed] = refreshOperationStatuses([withCompleted])
    expect(refreshed.operations[0].status).toBe('completed')
    for (const op of refreshed.operations.slice(1)) {
      expect(op.status).toBe('due')
    }
  })
})
