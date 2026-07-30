import { describe, it, expect } from 'vitest'
import type { FieldRow, PlantInstance } from '@/features/field/types'
import type { Finding } from '../types'
import { SEVERITY_COLORS } from '../types'
import {
  findingExtent, findingExtentPct, fieldHealth, totalPlantCount,
  FIELD_HEALTH_COLORS, SEVERITY_COLORS_SOFT,
} from './fieldHealth'

function mkPlant(id: string): PlantInstance {
  return { id, cropTypeId: 'plantain', lat: 18.2, lng: -66.5, plantingDate: '2026-01-15' }
}

function mkRow(id: string, plantIds: string[]): FieldRow {
  return {
    id,
    startLat: 18.2, startLng: -66.5, endLat: 18.201, endLng: -66.501,
    spacingFt: 6,
    primaryCropTypeId: 'plantain',
    companionCropTypeId: null,
    plants: plantIds.map(mkPlant),
    plantingDate: '2026-01-15',
  }
}

function mkFinding(partial: Partial<Finding>): Finding {
  return {
    id: 'f1', fieldId: 'field-1', pestId: 'picudo_negro', severity: 1,
    status: 'open', foundDate: '2026-07-30', notes: null,
    rowIds: [], plantIds: [], treatmentRecommendedOperationId: null,
    createdAt: '2026-07-30T00:00:00Z',
    ...partial,
  }
}

// 20 plants: two rows of 8 + 4 free plants
const field = {
  id: 'field-1',
  rows: [
    mkRow('row-a', ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']),
    mkRow('row-b', ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']),
  ],
  freePlants: ['x1', 'x2', 'x3', 'x4'].map(mkPlant),
}

describe('findingExtent', () => {
  it('counts row plants plus loose plants against the field total', () => {
    expect(totalPlantCount(field)).toBe(20)
    // row-a (8) + 2 individuals = 10/20
    const f = mkFinding({ rowIds: ['row-a'], plantIds: ['x1', 'x2'] })
    expect(findingExtent(f, field)).toBe(0.5)
  })

  it('does not double-count plants inside referenced rows', () => {
    const f = mkFinding({ rowIds: ['row-a'], plantIds: ['a1', 'a2'] })
    expect(findingExtent(f, field)).toBe(8 / 20)
  })

  it('field-level findings cover the whole field, even without plants', () => {
    expect(findingExtent(mkFinding({}), field)).toBe(1)
    expect(findingExtent(mkFinding({}), { rows: [], freePlants: [] })).toBe(1)
  })

  it('extent % hides for field-level findings', () => {
    expect(findingExtentPct(mkFinding({}), field)).toBeNull()
    expect(findingExtentPct(mkFinding({ plantIds: ['a1'] }), field)).toBe(5)
  })
})

describe('fieldHealth', () => {
  it('bare ground with no findings is neutral', () => {
    const health = fieldHealth({ id: 'field-1', rows: [], freePlants: [] }, [])
    expect(health.status).toBe('empty')
    expect(health.color).toBe(FIELD_HEALTH_COLORS.empty)
  })

  it('planted with no findings is green', () => {
    const health = fieldHealth(field, [])
    expect(health.status).toBe('healthy')
    expect(health.color).toBe(FIELD_HEALTH_COLORS.healthy)
  })

  it('a couple of leve plants stay below the alarm threshold', () => {
    // 1/20 = 5% < 10% — field stays green, badge still counts it
    const health = fieldHealth(field, [mkFinding({ plantIds: ['a1'] })])
    expect(health.status).toBe('healthy')
    expect(health.unresolvedCount).toBe(1)
    expect(health.maxUnresolvedSeverity).toBe(1)
  })

  it('leve tints the field once extent passes the threshold', () => {
    // a whole row = 40% ≥ 10%
    const health = fieldHealth(field, [mkFinding({ rowIds: ['row-a'] })])
    expect(health.status).toBe('alert')
    expect(health.color).toBe(SEVERITY_COLORS[1])
  })

  it('one severa plant alerts immediately regardless of extent', () => {
    const health = fieldHealth(field, [mkFinding({ severity: 3, plantIds: ['a1'] })])
    expect(health.status).toBe('alert')
    expect(health.color).toBe(SEVERITY_COLORS[3])
  })

  it('the worst alerting finding wins the color', () => {
    const health = fieldHealth(field, [
      mkFinding({ id: 'f1', severity: 1, rowIds: ['row-a'] }),
      mkFinding({ id: 'f2', severity: 2, rowIds: ['row-b'] }),
    ])
    expect(health.color).toBe(SEVERITY_COLORS[2])
  })

  it('softens the color when every alerting finding is treated', () => {
    const health = fieldHealth(field, [
      mkFinding({ severity: 3, status: 'treated', plantIds: ['a1'] }),
    ])
    expect(health.status).toBe('alert')
    expect(health.treatedOnly).toBe(true)
    expect(health.color).toBe(SEVERITY_COLORS_SOFT[3])
  })

  it('resolved findings stop affecting the field', () => {
    const health = fieldHealth(field, [
      mkFinding({ severity: 3, status: 'resolved', rowIds: ['row-a'] }),
    ])
    expect(health.status).toBe('healthy')
    expect(health.unresolvedCount).toBe(0)
  })

  it('a fallow field can still alert on field-level findings', () => {
    // e.g. weeds/rodents noted on an empty field: extent 1 ≥ threshold
    const bare = { id: 'field-1', rows: [], freePlants: [] }
    const health = fieldHealth(bare, [mkFinding({ pestId: 'malezas' })])
    expect(health.status).toBe('alert')
    expect(health.color).toBe(SEVERITY_COLORS[1])
  })

  it('ignores other fields’ findings', () => {
    const health = fieldHealth(field, [
      mkFinding({ fieldId: 'other-field', severity: 3, rowIds: ['row-a'] }),
    ])
    expect(health.status).toBe('healthy')
    expect(health.unresolvedCount).toBe(0)
  })
})
