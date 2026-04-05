import { useRef, useState } from 'react'
import { Polygon, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import { useFieldStore } from '@/store/useFieldStore'
import type { PlacedField as PlacedFieldType } from '../types'

// At Gurabo PR's latitude (~18.2°N):
// 1 degree latitude  ≈ 364,000 feet
// 1 degree longitude ≈ 298,000 feet
const FT_PER_LAT_DEGREE = 364000
const FT_PER_LNG_DEGREE = 298000

type Props = {
  field: PlacedFieldType
  onEdit: (fieldId: string) => void
}

export default function PlacedField({ field, onEdit }: Props) {
  const { updateField } = useFieldStore()
  const [isHovered, setIsHovered] = useState(false)
  const isDragging = useRef(false)
  useMapEvents({})

  function getMapPositions(): L.LatLng[] {
    // Convert field's real-world dimensions to degree offsets
    const fieldWidthDeg = field.widthFt / FT_PER_LNG_DEGREE
    const fieldHeightDeg = field.heightFt / FT_PER_LAT_DEGREE

    // Each normalized point (0-1) maps to actual degree offsets
    // centered on the placement lat/lng
    return field.points.map(p => {
      const lat = field.farmLat + (0.5 - p.y) * fieldHeightDeg
      const lng = field.farmLng + (p.x - 0.5) * fieldWidthDeg
      return L.latLng(lat, lng)
    })
  }

  function handleClick() {
    if (isDragging.current) return
    if (field.isPositioning) {
      updateField(field.id, { isPositioning: false })
    } else {
      onEdit(field.id)
    }
  }

  const positions = getMapPositions()

  return (
    <Polygon
      positions={positions}
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
    />
  )
}