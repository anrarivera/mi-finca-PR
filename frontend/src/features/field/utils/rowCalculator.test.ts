import { describe, it, expect } from 'vitest'
import { computeCropSummary } from './rowCalculator'
import { getCropById } from '../data/cropLibrary'
import type { FieldRow, PlantInstance } from '../types'

function plant(id: string, cropTypeId: string): PlantInstance {
  return { id, cropTypeId, lat: 18.2, lng: -66.6, plantingDate: '2026-06-01' }
}

function row(id: string, cropTypeId: string, plants: PlantInstance[]): FieldRow {
  return {
    id,
    startLat: 18.2, startLng: -66.6, endLat: 18.201, endLng: -66.599,
    spacingFt: 3,
    primaryCropTypeId: cropTypeId,
    companionCropTypeId: null,
    plantingDate: '2026-06-01',
    plants,
  }
}

describe('computeCropSummary', () => {
  it('returns an empty array with no plants', () => {
    expect(computeCropSummary([], [], getCropById)).toEqual([])
  })

  it('counts plants across rows and free plants by crop', () => {
    const rows = [
      row('r1', 'plantain', [plant('p1', 'plantain'), plant('p2', 'plantain')]),
      row('r2', 'tomato', [plant('p3', 'tomato')]),
    ]
    const free = [plant('p4', 'plantain'), plant('p5', 'mango')]
    const summary = computeCropSummary(rows, free, getCropById)

    const byId = Object.fromEntries(summary.map(s => [s.cropTypeId, s]))
    expect(byId.plantain.count).toBe(3)
    expect(byId.tomato.count).toBe(1)
    expect(byId.mango.count).toBe(1)
    expect(byId.plantain.nameEs).toBe('Plátano')
    expect(byId.plantain.emoji).toBe('🍌')
  })

  it('falls back to the crop id for unknown crops', () => {
    const summary = computeCropSummary([], [plant('p1', 'dinosaur_kale')], getCropById)
    expect(summary).toHaveLength(1)
    expect(summary[0].name).toBe('dinosaur_kale')
    expect(summary[0].emoji).toBe('🌱')
  })
})
