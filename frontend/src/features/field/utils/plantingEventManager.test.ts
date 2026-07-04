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
