import { useRef, useState } from 'react'
import { Polygon, Marker, Tooltip, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import { useFieldStore } from '@/store/useFieldStore'
import type { PlacedField as PlacedFieldType } from '../types'

const FT_PER_LAT_DEGREE = 364000
const FT_PER_LNG_DEGREE = 298000

type Props = {
  field: PlacedFieldType
  onEdit: (fieldId: string) => void
}

// Custom colored pin icon
function createPinIcon(color: string, name: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconAnchor: [12, 32],
    popupAnchor: [0, -32],
    html: `
      <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
        <div style="
          background: white;
          border: 1.5px solid ${color};
          color: #2d4a1e;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          font-family: system-ui, sans-serif;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
        ">${name}</div>
        <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z"
            fill="${color}" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="4" fill="white"/>
        </svg>
      </div>
    `,
  })
}

export default function PlacedField({ field, onEdit }: Props) {
  const { updateField } = useFieldStore()
  const [isHovered, setIsHovered] = useState(false)
  const isDragging = useRef(false)
  useMapEvents({})

  function getMapPositions(): L.LatLng[] {
    const fieldWidthDeg = field.widthFt / FT_PER_LNG_DEGREE
    const fieldHeightDeg = field.heightFt / FT_PER_LAT_DEGREE
    return field.points.map(p => L.latLng(
      field.farmLat + (0.5 - p.y) * fieldHeightDeg,
      field.farmLng + (p.x - 0.5) * fieldWidthDeg,
    ))
  }

  function getCenterLatLng(): L.LatLng {
    return L.latLng(field.farmLat, field.farmLng)
  }

  function handleClick() {
    if (isDragging.current) return
    if (field.isPositioning) {
      updateField(field.id, { isPositioning: false })
    } else {
      onEdit(field.id)
    }
  }

  // ── Pin mode ──────────────────────────────────────────────────────
  if (field.displayMode === 'pin') {
    return (
      <Marker
        position={getCenterLatLng()}
        icon={createPinIcon(field.color, field.name)}
        eventHandlers={{ click: handleClick }}
      />
    )
  }

  // ── Shape mode ────────────────────────────────────────────────────
  return (
    <Polygon
      positions={getMapPositions()}
      pathOptions={{
        color: field.color,
        fillColor: field.color,
        fillOpacity: isHovered ? 0.5 : field.isPositioning ? 0.3 : 0.4,
        weight: field.isPositioning ? 2.5 : 2,
        dashArray: field.isPositioning ? '6 4' : undefined,
      }}
      eventHandlers={{
        click: handleClick,
        mouseover: () => setIsHovered(true),
        mouseout: () => setIsHovered(false),
      }}
    >
      <Tooltip permanent direction="top" offset={[0, -4]}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#2d4a1e' }}>
          {field.name}
        </span>
      </Tooltip>
    </Polygon>
  )
}