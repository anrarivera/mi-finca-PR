import { create } from 'zustand'

// ──────────────────────────────────────────────────────────────────────────
// Live harvest-selection highlight. While the check-off / partial-harvest
// modal is open, the HarvestSelector publishes the rows and plants the user
// has ticked; the map subscribes and paints them amber so you can see on
// the imagery exactly what "rows 1–3 + first 5 plants of row 4" means.
// Cleared automatically when the modal closes.
// ──────────────────────────────────────────────────────────────────────────

export type HarvestHighlight = {
  /** Fully selected rows. */
  rowIds: string[]
  /** Every selected plant (including those inside fully selected rows). */
  plantIds: string[]
}

type HarvestHighlightStore = {
  highlight: HarvestHighlight | null
  setHighlight: (h: HarvestHighlight) => void
  clearHighlight: () => void
}

export const useHarvestHighlightStore = create<HarvestHighlightStore>()((set) => ({
  highlight: null,
  setHighlight: (highlight) => set({ highlight }),
  clearHighlight: () => set({ highlight: null }),
}))
