import { create } from 'zustand'

// ──────────────────────────────────────────────────────────────────────────
// Live scope-selection bridge between an open selector and the map.
// While the check-off / partial modal is open, its scope selector publishes
// the rows and plants the user has ticked; the map subscribes and paints
// them amber so you can see on the imagery exactly what "rows 1–3 + first
// 5 plants of row 4" means. It ALSO registers toggle handlers so the map
// works in the other direction: clicking a row line or a plant dot on the
// map toggles it in the open selector. Cleared when the modal closes.
// ──────────────────────────────────────────────────────────────────────────

export type HarvestHighlight = {
  /** Fully selected rows. */
  rowIds: string[]
  /** Every selected plant (including those inside fully selected rows). */
  plantIds: string[]
}

export type MapSelectionToggles = {
  /** The field the open selector belongs to — only that field renders
      clickable plants/rows on the map while the selector is open. */
  fieldId?: string
  /** Toggle a whole row by id — no-op for rows outside the selector. */
  toggleRow: (rowId: string) => void
  /** Toggle a single plant by id — no-op for plants outside the selector. */
  togglePlant: (plantId: string) => void
}

type HarvestHighlightStore = {
  highlight: HarvestHighlight | null
  /** Non-null while a selector is open and accepting map clicks. */
  toggles: MapSelectionToggles | null
  setHighlight: (h: HarvestHighlight) => void
  clearHighlight: () => void
  setToggles: (t: MapSelectionToggles) => void
  clearToggles: () => void
}

export const useHarvestHighlightStore = create<HarvestHighlightStore>()((set) => ({
  highlight: null,
  toggles: null,
  setHighlight: (highlight) => set({ highlight }),
  clearHighlight: () => set({ highlight: null }),
  setToggles: (toggles) => set({ toggles }),
  clearToggles: () => set({ toggles: null }),
}))
