// ──────────────────────────────────────────────────────────────────────────
// Rough per-crop economics for the viability simulator. These are coarse
// planning estimates for small Puerto Rico operations (retail/agro-market
// pricing), NOT guarantees — the UI lets the user override every number and
// shows a disclaimer. Sources: general UPR-RUM extension figures and local
// market ranges, rounded aggressively.
// ──────────────────────────────────────────────────────────────────────────

export type CropEconomics = {
  cropTypeId: string
  /** Pounds harvested per plant per production cycle. */
  yieldPerPlantLbs: number
  /** Typical sale price per pound (USD). */
  pricePerLb: number
  /** Production cycles per year (perennials amortized). */
  cyclesPerYear: number
  /** All-in cost per plant per year: insumos, agua, mano de obra (USD). */
  costPerPlantYear: number
}

export const CROP_ECONOMICS: CropEconomics[] = [
  { cropTypeId: 'plantain', yieldPerPlantLbs: 50, pricePerLb: 0.6, cyclesPerYear: 1, costPerPlantYear: 12 },
  { cropTypeId: 'banana', yieldPerPlantLbs: 40, pricePerLb: 0.5, cyclesPerYear: 1, costPerPlantYear: 10 },
  { cropTypeId: 'pineapple', yieldPerPlantLbs: 4, pricePerLb: 1.2, cyclesPerYear: 0.7, costPerPlantYear: 2 },
  { cropTypeId: 'papaya', yieldPerPlantLbs: 60, pricePerLb: 0.9, cyclesPerYear: 1, costPerPlantYear: 15 },
  { cropTypeId: 'mango', yieldPerPlantLbs: 150, pricePerLb: 0.8, cyclesPerYear: 1, costPerPlantYear: 25 },
  { cropTypeId: 'avocado', yieldPerPlantLbs: 120, pricePerLb: 1.5, cyclesPerYear: 1, costPerPlantYear: 30 },
  { cropTypeId: 'orange', yieldPerPlantLbs: 200, pricePerLb: 0.5, cyclesPerYear: 1, costPerPlantYear: 30 },
  { cropTypeId: 'lemon', yieldPerPlantLbs: 100, pricePerLb: 0.9, cyclesPerYear: 1, costPerPlantYear: 25 },
  { cropTypeId: 'coffee', yieldPerPlantLbs: 2, pricePerLb: 6.0, cyclesPerYear: 1, costPerPlantYear: 4 },
  { cropTypeId: 'cacao', yieldPerPlantLbs: 3, pricePerLb: 3.5, cyclesPerYear: 1, costPerPlantYear: 5 },
  { cropTypeId: 'yuca', yieldPerPlantLbs: 6, pricePerLb: 0.8, cyclesPerYear: 1.2, costPerPlantYear: 1.5 },
  { cropTypeId: 'yautia', yieldPerPlantLbs: 3, pricePerLb: 1.4, cyclesPerYear: 1.2, costPerPlantYear: 1.5 },
  { cropTypeId: 'batata', yieldPerPlantLbs: 3, pricePerLb: 1.0, cyclesPerYear: 2, costPerPlantYear: 1.2 },
  { cropTypeId: 'name', yieldPerPlantLbs: 5, pricePerLb: 1.6, cyclesPerYear: 1, costPerPlantYear: 2 },
  { cropTypeId: 'tomato', yieldPerPlantLbs: 15, pricePerLb: 1.5, cyclesPerYear: 2, costPerPlantYear: 6 },
  { cropTypeId: 'pepper', yieldPerPlantLbs: 8, pricePerLb: 1.8, cyclesPerYear: 2, costPerPlantYear: 5 },
  { cropTypeId: 'recao', yieldPerPlantLbs: 1, pricePerLb: 4.0, cyclesPerYear: 4, costPerPlantYear: 1 },
  { cropTypeId: 'culantro', yieldPerPlantLbs: 1, pricePerLb: 4.0, cyclesPerYear: 4, costPerPlantYear: 1 },
  { cropTypeId: 'breadfruit', yieldPerPlantLbs: 300, pricePerLb: 0.7, cyclesPerYear: 1, costPerPlantYear: 20 },
  { cropTypeId: 'coconut', yieldPerPlantLbs: 100, pricePerLb: 0.6, cyclesPerYear: 1, costPerPlantYear: 15 },
]

// Conservative fallback for crops without a curated entry.
export const DEFAULT_ECONOMICS: Omit<CropEconomics, 'cropTypeId'> = {
  yieldPerPlantLbs: 5,
  pricePerLb: 1.0,
  cyclesPerYear: 1,
  costPerPlantYear: 3,
}

export function getEconomicsForCrop(cropTypeId: string): CropEconomics {
  return (
    CROP_ECONOMICS.find(c => c.cropTypeId === cropTypeId) ??
    { cropTypeId, ...DEFAULT_ECONOMICS }
  )
}
