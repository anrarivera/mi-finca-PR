import { useEffect, useRef, useState } from 'react'
import { Polygon, Polyline, CircleMarker, Marker, Tooltip, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import { useFieldStore } from '@/store/useFieldStore'
import type { PlacedField as PlacedFieldType, FieldRow } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// A field rendered on the farm map. Click behavior:
//  - single click → onSelect (opens the field-operations side drawer)
//  - double click → onOpenEditor (opens the full field editor)
// Leaflet fires click twice before dblclick, so the single-click action is
// deferred ~250 ms and cancelled when a double-click lands.
// Detail rendering: crop rows are drawn as lines inside every field shape;
// individual plants are drawn only for the selected field (`detailed`) to
// keep marker counts sane on farms with many fields.
// ──────────────────────────────────────────────────────────────────────────

const DOUBLE_CLICK_WINDOW_MS = 250

type Props = {
  field: PlacedFieldType
  /** Single click — show the field's operations drawer. */
  onSelect: (fieldId: string) => void
  /** Double click — open the full field editor. */
  onOpenEditor: (fieldId: string) => void
  /** Draw individual plants (the field selected in the ops drawer). */
  detailed?: boolean
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

export default function PlacedField({ field, onSelect, onOpenEditor, detailed = false }: Props) {
  const { updateField } = useFieldStore()
  const [isHovered, setIsHovered] = useState(false)
  const isDragging = useRef(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const map = useMapEvents({})

  // Clear any pending single-click when unmounting
  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
  }, [])

  function handleClick() {
    if (isDragging.current) return
    if (field.isPositioning) {
      updateField(field.id, { isPositioning: false })
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
    if (field.isPositioning) return
    // Zoom the map so the field fills the view — visible as soon as the
    // editor is closed again.
    if (field.boundary && field.boundary.length >= 3) {
      const bounds = L.latLngBounds(field.boundary.map(p => L.latLng(p.lat, p.lng)))
      map.flyToBounds(bounds, { padding: [60, 60], duration: 0.8 })
    } else {
      map.flyTo(L.latLng(field.farmLat, field.farmLng), Math.max(map.getZoom(), 18))
    }
    onOpenEditor(field.id)
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
        icon={createPinIcon(field.color, field.name)}
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
        icon={createPinIcon(field.color, field.name)}
        eventHandlers={eventHandlers}
      />
    )
  }

  const positions = field.boundary.map(p => L.latLng(p.lat, p.lng))
  const plants = detailed
    ? [...field.rows.flatMap(r => r.plants), ...field.freePlants]
    : []

  return (
    <>
      <Polygon
        positions={positions}
        pathOptions={{
          // Selected field (drawer card / map click) gets a stronger outline
          color: detailed ? '#2d4a1e' : field.color,
          fillColor: field.color,
          fillOpacity: isHovered || detailed ? 0.5 : field.isPositioning ? 0.3 : 0.4,
          weight: detailed ? 3 : field.isPositioning ? 2.5 : 2,
          dashArray: field.isPositioning ? '6 4' : undefined,
        }}
        eventHandlers={eventHandlers}
      >
        <Tooltip permanent direction="top" offset={[0, -4]}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#2d4a1e' }}>
            {field.name}
          </span>
        </Tooltip>
      </Polygon>

      {/* Crop rows — lat/lng straight to Leaflet, no conversion (SDD §2.2.3).
          interactive={false} so clicks fall through to the field polygon. */}
      {field.rows.map(row => (
        <Polyline
          key={row.id}
          positions={rowPositions(row)}
          interactive={false}
          pathOptions={{
            color: 'white',
            weight: detailed ? 2 : 1.5,
            opacity: detailed ? 0.9 : 0.6,
            dashArray: '1 6',
            lineCap: 'round',
          }}
        />
      ))}

      {/* Individual plants — only for the selected field */}
      {plants.map(plant => (
        <CircleMarker
          key={plant.id}
          center={L.latLng(plant.lat, plant.lng)}
          radius={2.5}
          interactive={false}
          pathOptions={{
            color: '#2d4a1e',
            weight: 1,
            fillColor: '#d4e8b0',
            fillOpacity: 1,
          }}
        />
      ))}
    </>
  )
}
