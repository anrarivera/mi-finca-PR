// ──────────────────────────────────────────────────────────────────────────
// Added by Claude — edit one or many existing rows.
//
// Changes the crop, companion, plant spacing, and planting date of the selected
// row(s) and regenerates each row's plants along its existing geometry. Fields
// are prefilled when every selected row shares the same value; otherwise they
// start blank ("Varios") and a field is only applied once the user touches it,
// so a bulk edit can change just the crop while leaving each row's own spacing
// and date intact.
// ──────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import CropSelector from './cropSelector'
import { calculateRowPlantPositions, pointInPolygon, placePlantsAlongPath } from '../utils/canvasGeo'
import { todayISO } from '../types'
import type { FieldRow, PlantInstance } from '../types'

type Props = {
  rows: FieldRow[] // the row(s) being edited (1 = single, >1 = bulk)
  boundary: Array<{ lat: number; lng: number }>
  onApply: (updated: FieldRow[]) => void
  onCancel: () => void
}

export default function RowEditPanel({ rows, boundary, onApply, onCancel }: Props) {
  const bulk = rows.length > 1
  const allSame = <T,>(get: (r: FieldRow) => T) => rows.every(r => get(r) === get(rows[0]))

  // Prefill from the shared value when the rows agree; blank otherwise.
  const [primaryCropId, setPrimaryCropId] = useState(
    allSame(r => r.primaryCropTypeId) ? rows[0].primaryCropTypeId : '',
  )
  const [companionCropId, setCompanionCropId] = useState(
    allSame(r => r.companionCropTypeId) ? (rows[0].companionCropTypeId ?? '') : '',
  )
  const [spacingFt, setSpacingFt] = useState(
    allSame(r => r.spacingFt) ? rows[0].spacingFt : 6,
  )
  const [plantingDate, setPlantingDate] = useState(
    allSame(r => r.plantingDate) ? rows[0].plantingDate : todayISO(),
  )

  // A field only overrides the rows once the user has touched it.
  const [primaryDirty, setPrimaryDirty] = useState(false)
  const [companionDirty, setCompanionDirty] = useState(false)
  const [spacingDirty, setSpacingDirty] = useState(false)
  const [dateDirty, setDateDirty] = useState(false)

  function buildUpdated(): FieldRow[] {
    return rows.map(r => {
      const primary = primaryDirty ? primaryCropId : r.primaryCropTypeId
      const companion = companionDirty ? (companionCropId || null) : r.companionCropTypeId
      const spacing = spacingDirty ? spacingFt : r.spacingFt
      const date = dateDirty ? plantingDate : r.plantingDate

      const base = {
        ...r,
        primaryCropTypeId: primary,
        companionCropTypeId: companion,
        spacingFt: spacing,
        plantingDate: date,
      }

      // Plants must be regenerated along the geometry when the layout
      // changes: a spacing edit, or ADDING a companion to a row that never
      // had one (retagging can't materialize plants that don't exist).
      // For every other edit (crop swap, companion change/removal, date),
      // keep the row's existing plants — including any the user deleted
      // one by one — and just retag them; regenerating would resurrect
      // those deletions.
      const addsCompanion = companionDirty && !!companion && !r.companionCropTypeId
      if (!spacingDirty && !addsCompanion) {
        const plants: PlantInstance[] = r.plants.map(p => {
          let cropTypeId = p.cropTypeId
          if (p.cropTypeId === r.primaryCropTypeId) {
            cropTypeId = primary
          } else if (r.companionCropTypeId && p.cropTypeId === r.companionCropTypeId) {
            cropTypeId = companion ?? primary
          }
          return { ...p, cropTypeId, plantingDate: date }
        })
        return { ...base, plants }
      }

      // Regenerate plants along the row's existing geometry — a contour ring
      // walks its path; a straight row walks its start→end segment.
      const positions = r.path
        ? placePlantsAlongPath(r.path, spacing, r.pathClosed ?? true)
        : calculateRowPlantPositions(
            r.startLat, r.startLng, r.endLat, r.endLng, spacing,
          ).filter(pos => pointInPolygon(pos, boundary))
      if (positions.length < 2) return base // keep existing plants if it fails

      const plants: PlantInstance[] = positions.map((pos, i) => {
        const isCompanion = !!companion && i % 2 !== 0
        return {
          id: `${r.id}_plant_${i}`,
          cropTypeId: isCompanion ? (companion as string) : primary,
          lat: pos.lat,
          lng: pos.lng,
          plantingDate: date,
        }
      })
      return { ...base, plants }
    })
  }

  // Cheap enough to recompute per keystroke; memoizing it with an
  // incomplete dependency list previously showed a stale count.
  const previewPlantCount = buildUpdated().reduce((s, r) => s + r.plants.length, 0)

  function handleApply() {
    onApply(buildUpdated())
  }

  return (
    <div className="absolute right-4 top-4 z-10 w-60 bg-white rounded-xl border border-[#e0e8d8] shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0]">
        <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
          {bulk ? `Editar ${rows.length} hileras` : 'Editar hilera'}
        </p>
        <button onClick={onCancel}
          className="w-5 h-5 flex items-center justify-center text-[#9aab8a] hover:text-red-400 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {bulk && (
          <p className="text-[10px] text-[#9aab8a] leading-relaxed">
            Solo los campos que cambies se aplican a las {rows.length} hileras seleccionadas.
          </p>
        )}

        {/* Primary crop */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Cultivo principal</label>
          <CropSelector
            value={primaryCropId || null}
            onChange={(id) => { setPrimaryCropId(id); setPrimaryDirty(true) }}
            placeholder={bulk ? 'Varios — sin cambios' : 'Seleccionar cultivo'}
          />
        </div>

        {/* Companion crop */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">
            Planta compañera <span className="text-[#9aab8a] font-normal">(opcional)</span>
          </label>
          <CropSelector
            value={companionCropId || null}
            onChange={(id) => { setCompanionCropId(id); setCompanionDirty(true) }}
            placeholder={bulk ? 'Varios — sin cambios' : 'Sin compañera'}
            allowClear
          />
        </div>

        {/* Plant spacing */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Espaciado entre plantas</label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={50} value={spacingFt}
              onChange={e => { setSpacingFt(Math.max(1, Number(e.target.value))); setSpacingDirty(true) }}
              className="w-20 px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
            />
            <span className="text-xs text-[#9aab8a]">pies</span>
          </div>
        </div>

        {/* Planting date */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Fecha de siembra</label>
          <input type="date" value={plantingDate} max={todayISO()}
            onChange={e => { setPlantingDate(e.target.value); setDateDirty(true) }}
            className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
          />
        </div>

        {/* Resulting plant count */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
          <div className="w-2 h-2 rounded-full bg-[#639922] shrink-0" />
          <span className="text-xs text-[#3b6d11] font-medium">
            {previewPlantCount} plantas en {rows.length} {rows.length === 1 ? 'hilera' : 'hileras'}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={handleApply}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
          >
            <Check size={13} /> Aplicar cambios
          </button>
          <button onClick={onCancel}
            className="w-full py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
