import { getEconomicsForCrop } from './data/cropEconomics'

// ──────────────────────────────────────────────────────────────────────────
// Viability simulator engine. Pure function of its inputs so it is easy to
// unit-test: given crop counts and (possibly user-overridden) assumptions,
// project annual production, revenue, cost, and net income.
// ──────────────────────────────────────────────────────────────────────────

export type SimCropInput = {
  cropTypeId: string
  count: number
  /** Per-crop overrides; anything omitted falls back to the curated data. */
  yieldPerPlantLbs?: number
  pricePerLb?: number
  cyclesPerYear?: number
  costPerPlantYear?: number
}

export type SimCropResult = {
  cropTypeId: string
  count: number
  yieldPerPlantLbs: number
  pricePerLb: number
  cyclesPerYear: number
  costPerPlantYear: number
  annualYieldLbs: number
  annualRevenue: number
  annualCost: number
  annualNet: number
}

export type SimResult = {
  perCrop: SimCropResult[]
  totals: {
    plants: number
    annualYieldLbs: number
    annualRevenue: number
    annualCost: number
    annualNet: number
  }
}

export function simulateFarm(crops: SimCropInput[]): SimResult {
  // Zero-count rows are kept (contributing zeros): the simulator table edits
  // counts in place, and dropping a row the moment the user types 0 would
  // make it vanish from the UI mid-edit.
  const perCrop: SimCropResult[] = crops
    .map(c => {
      const base = getEconomicsForCrop(c.cropTypeId)
      const yieldPerPlantLbs = c.yieldPerPlantLbs ?? base.yieldPerPlantLbs
      const pricePerLb = c.pricePerLb ?? base.pricePerLb
      const cyclesPerYear = c.cyclesPerYear ?? base.cyclesPerYear
      const costPerPlantYear = c.costPerPlantYear ?? base.costPerPlantYear

      const annualYieldLbs = c.count * yieldPerPlantLbs * cyclesPerYear
      const annualRevenue = annualYieldLbs * pricePerLb
      const annualCost = c.count * costPerPlantYear
      return {
        cropTypeId: c.cropTypeId,
        count: c.count,
        yieldPerPlantLbs,
        pricePerLb,
        cyclesPerYear,
        costPerPlantYear,
        annualYieldLbs,
        annualRevenue,
        annualCost,
        annualNet: annualRevenue - annualCost,
      }
    })
    .sort((a, b) => b.annualNet - a.annualNet)

  const totals = perCrop.reduce(
    (acc, c) => ({
      plants: acc.plants + c.count,
      annualYieldLbs: acc.annualYieldLbs + c.annualYieldLbs,
      annualRevenue: acc.annualRevenue + c.annualRevenue,
      annualCost: acc.annualCost + c.annualCost,
      annualNet: acc.annualNet + c.annualNet,
    }),
    { plants: 0, annualYieldLbs: 0, annualRevenue: 0, annualCost: 0, annualNet: 0 }
  )

  return { perCrop, totals }
}
