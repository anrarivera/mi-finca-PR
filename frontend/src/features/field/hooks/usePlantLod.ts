import { useState } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import type * as L from 'leaflet'

// ──────────────────────────────────────────────────────────────────────────
// Level-of-detail for plant dots. A large field can hold 10k+ plants, and
// every dot is a React component owning an SVG node — rendering them all
// froze the map long before the dots were readable. Two observations make
// the cut safe:
//   1. Below ~zoom 17 neighboring plants are 1–2 px apart — the dots are
//      noise; the row lines already tell the visual story.
//   2. At any zoom where dots ARE individually readable, only a bounded
//      number fit on screen — so viewport culling caps the live markers
//      at a constant regardless of field size.
// MAX_PLANT_DOTS backstops odd zoom/screen combinations (a dense 20-acre
// field can still fit wholly on a desktop viewport at zoom 18): rather
// than render thousands of markers we draw rows only until the user zooms
// in further.
// ──────────────────────────────────────────────────────────────────────────

export const PLANT_DOT_MIN_ZOOM = 17
export const MAX_PLANT_DOTS = 1500

export type PlantView = { zoom: number; bounds: L.LatLngBounds }

/** Current zoom + padded viewport bounds, refreshed after each pan/zoom.
    Must be used inside a MapContainer. */
export function usePlantView(): PlantView {
  const map = useMap()
  // 20% padding so plants just off-screen exist already mid-pan.
  const read = () => ({ zoom: map.getZoom(), bounds: map.getBounds().pad(0.2) })
  const [view, setView] = useState<PlantView>(read)
  useMapEvents({
    moveend: () => setView(read()),
    zoomend: () => setView(read()),
  })
  return view
}

/** The plants worth rendering for the current view: none when zoomed out,
    only those inside the (padded) viewport otherwise — and none at all if
    even the visible set is too large to render responsively. */
export function cullPlants<T extends { plant: { lat: number; lng: number } }>(
  items: T[],
  view: PlantView
): T[] {
  if (view.zoom < PLANT_DOT_MIN_ZOOM) return []
  const south = view.bounds.getSouth()
  const north = view.bounds.getNorth()
  const west = view.bounds.getWest()
  const east = view.bounds.getEast()
  const visible = items.filter(({ plant }) =>
    plant.lat >= south && plant.lat <= north &&
    plant.lng >= west && plant.lng <= east
  )
  return visible.length > MAX_PLANT_DOTS ? [] : visible
}
