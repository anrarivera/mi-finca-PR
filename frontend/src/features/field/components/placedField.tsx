import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Polygon, Polyline, CircleMarker, Marker, Tooltip } from 'react-leaflet'
import * as L from 'leaflet'
import { useFieldStore } from '@/store/useFieldStore'
import { usePlantView, cullPlants } from '../hooks/usePlantLod'
import type { HarvestHighlight, MapSelectionToggles } from '@/store/useHarvestHighlightStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { getAnimalById } from '@/features/livestock/data/animalLibrary'
import { useIsCoarsePointer } from '@/hooks/useViewport'
import { useHarvestHighlightStore } from '@/store/useHarvestHighlightStore'
import { plantVisualStatus, PLANT_STATUS_STYLE, type PlantMarks } from '../utils/plantStatus'
import {
  EMPTY_FINDING_MARKS, type FindingMarks,
} from '@/features/scouting/utils/findingScope'
import { SEVERITY_COLORS } from '@/features/scouting/types'
import type { PlacedField as PlacedFieldType, FieldRow } from '../types'

const EMPTY_MARKS: PlantMarks = { plantIds: new Set(), rowIds: new Set() }

// ──────────────────────────────────────────────────────────────────────────
// A field rendered on the farm map. Click behavior:
//  - single click → onSelect (opens the field-operations side drawer)
//  - double click → onFocusField (zoom to the field + drawer on its card;
//    the editor is only reached through the card's Editar button)
// Leaflet fires click twice before dblclick, so the single-click action is
// deferred ~250 ms and cancelled when a double-click lands.
// Detail rendering: crop rows are drawn as lines inside every field shape;
// individual plants are drawn only for the selected field (`detailed`),
// and even then with level-of-detail (zoomed-in + viewport-culled + capped
// — see usePlantLod) so a 10k-plant field can't flood the map with markers.
// ──────────────────────────────────────────────────────────────────────────

const DOUBLE_CLICK_WINDOW_MS = 250

type Props = {
  field: PlacedFieldType
  /** Single click — show the field's operations drawer. */
  onSelect: (fieldId: string) => void
  /** Double click — zoom to the field and open the drawer on its card.
      The host performs the zoom so it pairs with the drawer-close
      zoom-out. */
  onFocusField: (fieldId: string) => void
  /** Draw individual plants (the field selected in the ops drawer). */
  detailed?: boolean
  /** Plant/row ids covered by operations — colors removed plants red. */
  plantMarks?: PlantMarks
  /** Unresolved scouting findings — paints affected rows/plants amber→red
      by severity until the finding is resolved. */
  findingMarks?: FindingMarks
  /** Health traffic-light color (derived from findings) — replaces the
      stored field.color for the fill and pin so the zoomed-out map reads
      as a dashboard: gray = bare, green = healthy, amber→red = alert. */
  displayColor?: string
}

// A row's geometry: the drawn path when present, else the start→end segment.
function rowPositions(row: FieldRow): L.LatLng[] {
  if (row.path && row.path.length >= 2) {
    const pts = row.path.map(p => L.latLng(p.lat, p.lng))
    return row.pathClosed ? [...pts, pts[0]] : pts
  }
  return [
    L.latLng(row.startLat, row.startLng),
    L.latLng(row.endLat, row.endLng),
  ]
}

function createPinIcon(color: string, name: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconAnchor: [12, 32],
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
        <div style="background:white;border:1.5px solid ${color};color:#2d4a1e;font-size:10px;
          font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;
          box-shadow:0 1px 4px rgba(0,0,0,0.15);font-family:system-ui,sans-serif;
          max-width:120px;overflow:hidden;text-overflow:ellipsis;">${name}</div>
        <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z"
            fill="${color}" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="4" fill="white"/>
        </svg>
      </div>
    `,
  })
}

export default function PlacedField({
  field, onSelect, onFocusField, detailed = false, plantMarks = EMPTY_MARKS,
  findingMarks = EMPTY_FINDING_MARKS, displayColor,
}: Props) {
  const fieldColor = displayColor ?? field.color
  const { updateField } = useFieldStore()
  // Corral label: herds assigned to this livestock field — unique animal
  // emojis + total head count next to the name (e.g. "Corral 1 🐐🐔 27").
  const livestockUnits = useLivestockStore(s => s.units)
  const corralHerds = field.kind === 'livestock'
    ? livestockUnits.filter(u => u.fieldId === field.id)
    : []
  const tooltipLabel = corralHerds.length > 0
    ? `${field.name} ${[...new Set(
        corralHerds.map(u => getAnimalById(u.animalType)?.emoji ?? '🐾')
      )].join('')} ${corralHerds.reduce((sum, u) => sum + u.currentCount, 0)}`
    : field.name
  // Live harvest-modal selection — paints chosen rows/plants amber.
  const harvestHighlight = useHarvestHighlightStore(s => s.highlight)
  // While a scope selector is open, map clicks on rows/plants toggle them
  // in it — and the field's own click/dblclick actions are suspended.
  const mapToggles = useHarvestHighlightStore(s => s.toggles)
  // Only the selector's own field grows hit targets and shows its plants;
  // other fields would otherwise light up as if they were selected.
  const fieldToggles =
    mapToggles && (!mapToggles.fieldId || mapToggles.fieldId === field.id)
      ? mapToggles
      : null
  const [isHovered, setIsHovered] = useState(false)
  const isCoarsePointer = useIsCoarsePointer()
  const isDragging = useRef(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending single-click when unmounting
  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
  }, [])

  function handleClick() {
    if (isDragging.current || mapToggles) return
    if (field.isPositioning) {
      updateField(field.id, { isPositioning: false })
      return
    }
    // Touch reaches the editor through the drawer card's Editar button, so
    // taps select immediately instead of waiting out the dblclick window.
    if (isCoarsePointer) {
      onSelect(field.id)
      return
    }
    // Defer: if a dblclick follows, this select is cancelled.
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      onSelect(field.id)
    }, DOUBLE_CLICK_WINDOW_MS)
  }

  function handleDblClick(e: L.LeafletMouseEvent) {
    // Don't let the map's dblclick handlers (e.g. boundary point insertion)
    // also react to a field double-click.
    L.DomEvent.stopPropagation(e.originalEvent)
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    if (field.isPositioning || mapToggles) return
    onFocusField(field.id)
  }

  const eventHandlers = {
    click: handleClick,
    dblclick: handleDblClick,
    mouseover: () => setIsHovered(true),
    mouseout: () => setIsHovered(false),
  }

  // Pin mode — show at farm center point
  if (field.displayMode === 'pin') {
    return (
      <Marker
        position={L.latLng(field.farmLat, field.farmLng)}
        icon={createPinIcon(fieldColor, field.name)}
        eventHandlers={eventHandlers}
      />
    )
  }

  // Shape mode — use boundary lat/lng directly, no conversion needed
  if (!field.boundary || field.boundary.length < 3) {
    // Fallback to pin if boundary not yet set
    return (
      <Marker
        position={L.latLng(field.farmLat, field.farmLng)}
        icon={createPinIcon(fieldColor, field.name)}
        eventHandlers={eventHandlers}
      />
    )
  }

  const positions = field.boundary.map(p => L.latLng(p.lat, p.lng))

  return (
    <>
      <Polygon
        positions={positions}
        pathOptions={{
          // Selected field (drawer card / map click) gets a stronger outline
          color: detailed ? '#2d4a1e' : fieldColor,
          fillColor: fieldColor,
          fillOpacity: isHovered || detailed ? 0.5 : field.isPositioning ? 0.3 : 0.4,
          weight: detailed ? 3 : field.isPositioning ? 2.5 : 2,
          dashArray: field.isPositioning ? '6 4' : undefined,
        }}
        eventHandlers={eventHandlers}
      >
        <Tooltip permanent direction="top" offset={[0, -4]}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#2d4a1e' }}>
            {tooltipLabel}
          </span>
        </Tooltip>
      </Polygon>

      {/* Crop rows — lat/lng straight to Leaflet, no conversion (SDD §2.2.3).
          interactive={false} so clicks fall through to the field polygon.
          Rows selected in an open harvest modal highlight amber. */}
      {field.rows.map(row => {
        const inHarvest = harvestHighlight?.rowIds.includes(row.id) ?? false
        // Unresolved finding on this row — solid amber→red by severity.
        // The live selection highlight wins while a selector is open.
        const rowSev = findingMarks.rowSeverity.get(row.id)
        return (
          <Fragment key={row.id}>
            <Polyline
              positions={rowPositions(row)}
              interactive={false}
              pathOptions={{
                color: inHarvest ? '#f59e0b' : rowSev ? SEVERITY_COLORS[rowSev] : 'white',
                weight: inHarvest ? 3.5 : rowSev ? 3 : detailed ? 2 : 1.5,
                opacity: inHarvest ? 1 : rowSev ? 0.95 : detailed ? 0.9 : 0.6,
                dashArray: inHarvest || rowSev ? undefined : '1 6',
                lineCap: 'round',
              }}
            />
            {/* Invisible wide hit line — click toggles the row in the
                open scope selector */}
            {fieldToggles && (
              <Polyline
                positions={rowPositions(row)}
                pathOptions={{ opacity: 0, weight: 16 }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e.originalEvent)
                    fieldToggles.toggleRow(row.id)
                  },
                }}
              />
            )}
          </Fragment>
        )
      })}

      {/* Individual plants — only for the selected field, and while ITS
          scope selector is open so they can be clicked to toggle their
          selection. A child component so only that one field re-renders
          on pan/zoom (the LOD hook subscribes to map move events). */}
      {(detailed || fieldToggles) && (
        <FieldPlants
          field={field}
          fieldToggles={fieldToggles}
          harvestHighlight={harvestHighlight}
          plantMarks={plantMarks}
          findingMarks={findingMarks}
        />
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Plant dots with level-of-detail: zoomed out (or with too many plants on
// screen) the rows alone carry the picture — dots render only when zoomed
// in enough to be readable, and only inside the viewport. Colors:
// white = planned, green = planted, red = harvested/removed.
// ──────────────────────────────────────────────────────────────────────────
function FieldPlants({
  field, fieldToggles, harvestHighlight, plantMarks, findingMarks,
}: {
  field: PlacedFieldType
  fieldToggles: MapSelectionToggles | null
  harvestHighlight: HarvestHighlight | null
  plantMarks: PlantMarks
  findingMarks: FindingMarks
}) {
  const view = usePlantView()
  const allPlants = useMemo(
    () => [
      ...field.rows.flatMap(r => r.plants.map(p => ({ plant: p, rowId: r.id as string | undefined }))),
      ...field.freePlants.map(p => ({ plant: p, rowId: undefined as string | undefined })),
    ],
    [field.rows, field.freePlants]
  )
  const plants = cullPlants(allPlants, view)

  return (
    <>
      {plants.map(({ plant, rowId }) => {
        const style = PLANT_STATUS_STYLE[plantVisualStatus(plant, plantMarks, rowId)]
        const inHarvest = harvestHighlight?.plantIds.includes(plant.id) ?? false
        // Individually affected plant — severity fill until resolved.
        const plantSev = findingMarks.plantSeverity.get(plant.id)
        return (
          <Fragment key={plant.id}>
            <CircleMarker
              center={L.latLng(plant.lat, plant.lng)}
              radius={inHarvest ? 4 : plantSev ? 3.5 : 2.5}
              interactive={false}
              pathOptions={{
                color: inHarvest ? '#f59e0b' : plantSev ? '#7f1d1d' : style.color,
                weight: inHarvest ? 2 : 1,
                fillColor: plantSev ? SEVERITY_COLORS[plantSev] : style.fillColor,
                fillOpacity: 1,
              }}
            />
            {/* Invisible bigger hit circle — click toggles the plant in
                the open scope selector (drawn after the row hit lines so
                plants win where they overlap) */}
            {fieldToggles && (
              <CircleMarker
                center={L.latLng(plant.lat, plant.lng)}
                radius={8}
                pathOptions={{ opacity: 0, fillOpacity: 0 }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e.originalEvent)
                    fieldToggles.togglePlant(plant.id)
                  },
                }}
              />
            )}
          </Fragment>
        )
      })}
    </>
  )
}
