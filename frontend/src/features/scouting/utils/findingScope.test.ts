import { describe, it, expect } from 'vitest'
import type { FieldRow, PlantInstance, PlantingEvent } from '@/features/field/types'
import type { Finding } from '../types'
import {
  findingScopeSummary, rowsCoveringFinding, eventForFinding, buildFindingMarks,
} from './findingScope'

function mkPlant(id: string, cropTypeId = 'plantain', plantingDate = '2026-01-15'): PlantInstance {
  return { id, cropTypeId, lat: 18.2, lng: -66.5, plantingDate }
}

function mkRow(id: string, plants: PlantInstance[], cropTypeId = 'plantain', plantingDate = '2026-01-15'): FieldRow {
  return {
    id,
    startLat: 18.2, startLng: -66.5, endLat: 18.201, endLng: -66.501,
    spacingFt: 6,
    primaryCropTypeId: cropTypeId,
    companionCropTypeId: null,
    plants,
    plantingDate,
  }
}

function mkEvent(id: string, cropTypeId: string, rowIds: string[], plantingDate = '2026-01-15'): PlantingEvent {
  return {
    id, fieldId: 'field-1', cropTypeId, plantingDate,
    plantCount: 10, rowIds, freePlantIds: [], operations: [],
  }
}

function mkFinding(partial: Partial<Finding>): Finding {
  return {
    id: 'f1', fieldId: 'field-1', pestId: 'picudo_negro', severity: 2,
    status: 'open', foundDate: '2026-07-30', notes: null,
    rowIds: [], plantIds: [], treatmentRecommendedOperationId: null,
    createdAt: '2026-07-30T00:00:00Z',
    ...partial,
  }
}

const rowA = mkRow('row-a', [mkPlant('p1'), mkPlant('p2')])
const rowB = mkRow('row-b', [mkPlant('p3'), mkPlant('p4')])
const rowC = mkRow('row-c', [mkPlant('p5')], 'coffee')
const rows = [rowA, rowB, rowC]

describe('findingScopeSummary', () => {
  it('empty scope reads as the whole field', () => {
    expect(findingScopeSummary(mkFinding({}), rows)).toBe('Todo el campo')
  })

  it('rows are numbered by their position in the field', () => {
    expect(findingScopeSummary(mkFinding({ rowIds: ['row-c', 'row-a'] }), rows))
      .toBe('Hileras 1, 3')
    expect(findingScopeSummary(mkFinding({ rowIds: ['row-b'] }), rows))
      .toBe('Hilera 2')
  })

  it('combines rows and loose plants', () => {
    expect(findingScopeSummary(mkFinding({ rowIds: ['row-a'], plantIds: ['p3'] }), rows))
      .toBe('Hilera 1 + 1 planta')
  })

  it('plants alone are counted', () => {
    expect(findingScopeSummary(mkFinding({ plantIds: ['p1', 'p3'] }), rows))
      .toBe('2 plantas')
  })
})

describe('rowsCoveringFinding', () => {
  it('includes rows referenced directly and rows containing marked plants', () => {
    const finding = mkFinding({ rowIds: ['row-a'], plantIds: ['p4'] })
    expect(rowsCoveringFinding(finding, rows).map(r => r.id)).toEqual(['row-a', 'row-b'])
  })

  it('is empty for field-level findings', () => {
    expect(rowsCoveringFinding(mkFinding({}), rows)).toEqual([])
  })
})

describe('eventForFinding', () => {
  const platanoEvent = mkEvent('ev-platano', 'plantain', ['row-a', 'row-b'])
  const cafeEvent = mkEvent('ev-cafe', 'coffee', ['row-c'], '2026-03-01')
  const field = { rows, freePlants: [], plantingEvents: [platanoEvent, cafeEvent] }

  it('picks the event whose rows overlap the scope', () => {
    const finding = mkFinding({ rowIds: ['row-c'] })
    expect(eventForFinding(finding, field, [])?.id).toBe('ev-cafe')
  })

  it('resolves plants to their rows for overlap', () => {
    const finding = mkFinding({ plantIds: ['p1'] })
    expect(eventForFinding(finding, field, [])?.id).toBe('ev-platano')
  })

  it('field-level findings fall back to the crop the pest targets', () => {
    const finding = mkFinding({})
    expect(eventForFinding(finding, field, ['coffee'])?.id).toBe('ev-cafe')
  })

  it('otherwise falls back to the newest planting', () => {
    const finding = mkFinding({})
    expect(eventForFinding(finding, field, [])?.id).toBe('ev-cafe')
  })

  it('returns null with no planting events', () => {
    expect(eventForFinding(mkFinding({}), { ...field, plantingEvents: [] }, [])).toBeNull()
  })
})

describe('buildFindingMarks', () => {
  it('keeps the highest unresolved severity per row/plant', () => {
    const marks = buildFindingMarks([
      mkFinding({ id: 'f1', severity: 1, rowIds: ['row-a'], plantIds: ['p3'] }),
      mkFinding({ id: 'f2', severity: 3, rowIds: ['row-a'] }),
      mkFinding({ id: 'f3', severity: 2, status: 'treated', plantIds: ['p3'] }),
    ])
    expect(marks.rowSeverity.get('row-a')).toBe(3)
    expect(marks.plantSeverity.get('p3')).toBe(2)
  })

  it('resolved findings stop painting', () => {
    const marks = buildFindingMarks([
      mkFinding({ severity: 3, status: 'resolved', rowIds: ['row-a'], plantIds: ['p1'] }),
    ])
    expect(marks.rowSeverity.size).toBe(0)
    expect(marks.plantSeverity.size).toBe(0)
  })
})
