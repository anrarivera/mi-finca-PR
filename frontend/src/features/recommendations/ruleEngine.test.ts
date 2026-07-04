import { describe, it, expect } from 'vitest'
import { RuleBasedRecommendationService } from './ruleEngine'
import type { Farm } from '@/store/useFarmStore'
import type { PlacedField } from '@/features/field/types'
import type { LivestockUnit } from '@/features/livestock/types'

const service = new RuleBasedRecommendationService()

function makeFarm(overrides: Partial<Farm> = {}): Farm {
  return {
    id: 'farm1',
    name: 'Finca Test',
    location: 'Gurabo, PR',
    totalAreaAcres: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    boundary: [
      { lat: 18.2, lng: -66.6 },
      { lat: 18.21, lng: -66.6 },
      { lat: 18.21, lng: -66.59 },
    ],
    fieldIds: ['field1'],
    ...overrides,
  }
}

function makeField(overrides: Partial<PlacedField> = {}): PlacedField {
  return {
    id: 'field1',
    farmId: 'farm1',
    name: 'Campo 1',
    color: '#639922',
    shape: 'rectangle',
    widthFt: 100,
    heightFt: 100,
    boundary: [],
    farmLat: 18.2,
    farmLng: -66.6,
    rotation: 0,
    isPositioning: false,
    displayMode: 'shape',
    rows: [],
    freePlants: [],
    plantingEvents: [],
    ...overrides,
  } as PlacedField
}

// Fixed reference date: July 15, 2026 (hurricane season)
const JULY = new Date('2026-07-15T12:00:00')

describe('RuleBasedRecommendationService', () => {
  it('returns nothing for a completely empty state', () => {
    const recs = service.getRecommendations({
      farms: [], fields: [], livestock: [], today: JULY,
    })
    expect(recs).toEqual([])
  })

  it('flags overdue operations as urgent, sorted first', () => {
    const field = makeField({
      rows: [{ id: 'r1' } as never],
      plantingEvents: [{
        id: 'pe1', fieldId: 'field1', cropTypeId: 'plantain',
        plantingDate: '2026-01-01', plantCount: 5, rowIds: ['r1'], freePlantIds: [],
        operations: [{
          id: 'op1', plantingEventId: 'pe1', templateId: 't1',
          type: 'fertilization', labelEs: 'Primera fertilización',
          recommendedDate: '2026-06-01', status: 'due',
        }],
      }],
    })
    const recs = service.getRecommendations({
      farms: [makeFarm()], fields: [field], livestock: [], today: JULY,
    })
    expect(recs[0].severity).toBe('urgent')
    expect(recs[0].titleEs).toContain('labor vencida')
    expect(recs[0].fieldId).toBe('field1')
  })

  it('suggests drawing a boundary for farms without one', () => {
    const recs = service.getRecommendations({
      farms: [makeFarm({ boundary: [] })], fields: [], livestock: [], today: JULY,
    })
    expect(recs.some(r => r.id === 'noboundary_farm1')).toBe(true)
  })

  it('includes the hurricane-season notice between June and November', () => {
    const recs = service.getRecommendations({
      farms: [makeFarm()], fields: [makeField()], livestock: [], today: JULY,
    })
    expect(recs.some(r => r.id === 'season_hurricane')).toBe(true)
  })

  it('omits seasonal notices in May', () => {
    const recs = service.getRecommendations({
      farms: [makeFarm()], fields: [makeField()], livestock: [],
      today: new Date('2026-05-15T12:00:00'),
    })
    expect(recs.some(r => r.category === 'temporada')).toBe(false)
  })

  it('surfaces recurring livestock care tasks on their interval boundary', () => {
    const unit: LivestockUnit = {
      id: 'lv1', farmId: 'farm1', name: 'Gallinero',
      animalType: 'chickens', currentCount: 12,
      // Acquired exactly 30 days before JULY → coop_clean (every 30 days) fires
      acquisitionDate: '2026-06-15',
    }
    const recs = service.getRecommendations({
      farms: [makeFarm()], fields: [], livestock: [unit], today: JULY,
    })
    expect(recs.some(r => r.id === 'care_lv1_coop_clean')).toBe(true)
  })

  it('adds a rotating tip for each owned animal type', () => {
    const unit: LivestockUnit = {
      id: 'lv1', farmId: 'farm1', name: 'Apiario',
      animalType: 'bees', currentCount: 3,
      acquisitionDate: '2026-01-05',
    }
    const recs = service.getRecommendations({
      farms: [makeFarm()], fields: [], livestock: [unit], today: JULY,
    })
    expect(recs.some(r => r.id === 'tip_bees')).toBe(true)
  })

  it('orders results urgent → warning → info → tip', () => {
    const field = makeField({
      rows: [{ id: 'r1' } as never],
      plantingEvents: [{
        id: 'pe1', fieldId: 'field1', cropTypeId: 'plantain',
        plantingDate: '2026-01-01', plantCount: 5, rowIds: ['r1'], freePlantIds: [],
        operations: [{
          id: 'op1', plantingEventId: 'pe1', templateId: 't1',
          type: 'fertilization', labelEs: 'Fertilización',
          recommendedDate: '2026-06-01', status: 'due',
        }],
      }],
    })
    const recs = service.getRecommendations({
      farms: [makeFarm(), makeFarm({ id: 'farm2', name: 'Finca 2', boundary: [] })],
      fields: [field], livestock: [], today: JULY,
    })
    const order = { urgent: 0, warning: 1, info: 2, tip: 3 }
    for (let i = 1; i < recs.length; i++) {
      expect(order[recs[i].severity]).toBeGreaterThanOrEqual(order[recs[i - 1].severity])
    }
  })
})
