import { describe, it, expect } from 'vitest'
import { simulateFarm } from './engine'
import { getEconomicsForCrop, DEFAULT_ECONOMICS } from './data/cropEconomics'

describe('simulateFarm', () => {
  it('returns empty totals for no crops', () => {
    const result = simulateFarm([])
    expect(result.perCrop).toEqual([])
    expect(result.totals.annualNet).toBe(0)
  })

  it('projects revenue, cost, and net from curated economics', () => {
    // plantain: 50 lbs/plant × $0.60 × 1 cycle, $12 cost/plant
    const result = simulateFarm([{ cropTypeId: 'plantain', count: 100 }])
    const [c] = result.perCrop
    expect(c.annualYieldLbs).toBe(100 * 50)
    expect(c.annualRevenue).toBeCloseTo(100 * 50 * 0.6)
    expect(c.annualCost).toBe(100 * 12)
    expect(c.annualNet).toBeCloseTo(100 * 50 * 0.6 - 100 * 12)
    expect(result.totals.annualNet).toBeCloseTo(c.annualNet)
  })

  it('applies per-crop overrides over the curated values', () => {
    const result = simulateFarm([
      { cropTypeId: 'plantain', count: 10, pricePerLb: 1.0, yieldPerPlantLbs: 40 },
    ])
    const [c] = result.perCrop
    expect(c.annualRevenue).toBeCloseTo(10 * 40 * 1.0)
    // Non-overridden values still come from the curated data
    expect(c.costPerPlantYear).toBe(getEconomicsForCrop('plantain').costPerPlantYear)
  })

  it('falls back to conservative defaults for unknown crops', () => {
    const result = simulateFarm([{ cropTypeId: 'dragonglass', count: 10 }])
    expect(result.perCrop[0].yieldPerPlantLbs).toBe(DEFAULT_ECONOMICS.yieldPerPlantLbs)
  })

  it('drops zero-count rows and sorts by net descending', () => {
    const result = simulateFarm([
      { cropTypeId: 'plantain', count: 0 },
      { cropTypeId: 'recao', count: 100 },   // small net
      { cropTypeId: 'avocado', count: 100 }, // large net
    ])
    expect(result.perCrop).toHaveLength(2)
    expect(result.perCrop[0].cropTypeId).toBe('avocado')
  })
})
