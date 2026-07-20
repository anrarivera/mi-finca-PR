// ──────────────────────────────────────────────────────────────────────────
// Added by Claude — "Rellenar con hileras" (fill the field with rows) panel.
//
// Generates many evenly spaced parallel rows at once. The user chooses how many
// rows (1–9999), an optional fixed row length (or "Máximo" to fill the field),
// the spacing between rows and between plants, a walkway margin, a crop (and
// optional companion), and the orientation RELATIVE TO THE FIELD — rows run
// along the field's long or short axis, not the compass. Rows preview live on
// the canvas before being committed.
// ──────────────────────────────────────────────────────────────────────────
import { useMemo, useState, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import CropSelector from './cropSelector'
import {
  generateFillRows,
  generateContourRows,
  placePlantsAlongPath,
  calculateRowPlantPositions,
  pointInPolygon,
  distanceToBoundaryFt,
  getFieldDimensions,
  maxRowsThatFit,
} from '../utils/canvasGeo'
import { buildRowPlants } from '../utils/plantFactory'
import { todayISO } from '../types'
import type { FieldRow } from '../types'

type Props = {
  boundary: Array<{ lat: number; lng: number }>
  onPreview: (rows: FieldRow[]) => void
  onConfirm: (rows: FieldRow[]) => void
  onCancel: () => void
}

const DEFAULT_MARGIN = 10
const DEFAULT_ROW_SPACING = 12

export default function RowFillPanel({ boundary, onPreview, onConfirm, onCancel }: Props) {
  // The parent passes a memoized boundary (stable reference per geometry
  // change), so it can be used directly as a dependency — no stringify keys.

  // Field's oriented dimensions (long/short side), used for the size hint and
  // to seed a sensible default row count.
  const dims = useMemo(() => getFieldDimensions(boundary), [boundary])

  const [primaryCropId, setPrimaryCropId] = useState('')
  const [companionCropId, setCompanionCropId] = useState('')
  const [plantingDate, setPlantingDate] = useState(todayISO())
  const [spacingFt, setSpacingFt] = useState(6)            // between plants in a row
  const [rowSpacingFt, setRowSpacingFt] = useState(DEFAULT_ROW_SPACING) // between rows
  const [marginFt, setMarginFt] = useState(DEFAULT_MARGIN) // walkway / transit margin
  const [maxLength, setMaxLength] = useState(true)         // longest row that fits
  const [rowLengthFt, setRowLengthFt] = useState(50)
  const [orientation, setOrientation] = useState<'long' | 'short'>('long')
  // Added by Claude — 'parallel' = straight rows; 'contour' = rings following
  // the field shape.
  const [pattern, setPattern] = useState<'parallel' | 'contour'>('parallel')
  // Default the row count to what fills the field once (rows along the long
  // axis stack across the short side), then let the user edit it.
  const [count, setCount] = useState(() => {
    const stackFt = dims.shortFt - 2 * DEFAULT_MARGIN
    return Math.max(1, Math.floor(stackFt / DEFAULT_ROW_SPACING) + 1)
  })

  // Added by Claude — the most rows that fit; the count input is capped to it.
  const maxRows = useMemo(
    () => maxRowsThatFit(boundary, orientation, marginFt, rowSpacingFt),
    [boundary, orientation, marginFt, rowSpacingFt],
  )
  // Keep the requested count within what currently fits (e.g. after the user
  // widens the spacing or margin, or flips the orientation).
  useEffect(() => {
    setCount(c => Math.min(c, maxRows))
  }, [maxRows])

  // ── Build the rows from the current settings ──────────────────────────
  const builtRows = useMemo<FieldRow[]>(() => {
    const stamp = Date.now()
    const out: FieldRow[] = []

    // Assign primary/companion crops alternately; empty until a crop is
    // chosen so the preview shows line layout only.
    const makePlants = (rowId: string, positions: Array<{ lat: number; lng: number }>) =>
      primaryCropId
        ? buildRowPlants(rowId, positions, primaryCropId, companionCropId || null, plantingDate)
        : []

    // ── Contour mode: rows follow the field shape (rings / partial rings) ──
    if (pattern === 'contour') {
      const segs = generateContourRows(boundary, { marginFt, rowSpacingFt })
      segs.forEach((seg, idx) => {
        const positions = placePlantsAlongPath(seg.path, spacingFt, seg.closed)
        if (positions.length < 2) return
        const rowId = `row_${stamp}_c${idx}`
        out.push({
          id: rowId,
          startLat: seg.path[0].lat,
          startLng: seg.path[0].lng,
          endLat: seg.path[seg.path.length - 1].lat,
          endLng: seg.path[seg.path.length - 1].lng,
          spacingFt,
          primaryCropTypeId: primaryCropId,
          companionCropTypeId: companionCropId || null,
          plants: makePlants(rowId, positions),
          plantingDate,
          path: seg.path,
          pathClosed: seg.closed,
        })
      })
      return out
    }

    // ── Parallel mode: straight rows aligned to the field orientation ──
    const geoms = generateFillRows(boundary, {
      orientation,
      count,
      marginFt,
      rowSpacingFt,
      rowLengthFt: maxLength ? null : rowLengthFt,
    })
    geoms.forEach((g, idx) => {
      // Clip each row to the field, keeping a real `marginFt` gap from the
      // boundary on every side (not just the bounding box). This stops rows
      // from crowding the field limit and over-counting plants.
      const positions = calculateRowPlantPositions(
        g.startLat, g.startLng, g.endLat, g.endLng, spacingFt,
      ).filter(pos =>
        pointInPolygon(pos, boundary) &&
        distanceToBoundaryFt(pos, boundary) >= marginFt - 0.01
      )
      if (positions.length < 2) return

      const rowId = `row_${stamp}_${idx}`
      const plants = makePlants(rowId, positions)

      out.push({
        id: rowId,
        startLat: positions[0].lat,
        startLng: positions[0].lng,
        endLat: positions[positions.length - 1].lat,
        endLng: positions[positions.length - 1].lng,
        spacingFt,
        primaryCropTypeId: primaryCropId,
        companionCropTypeId: companionCropId || null,
        plants,
        plantingDate,
      })
    })
    return out
  }, [
    boundary, pattern, orientation, count, marginFt, rowSpacingFt, maxLength, rowLengthFt,
    spacingFt, primaryCropId, companionCropId, plantingDate,
  ])

  // Push the preview up so the canvas can draw it; clear it on unmount.
  useEffect(() => {
    onPreview(builtRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtRows])
  useEffect(() => {
    return () => onPreview([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const drawnCount = builtRows.length
  const plantCount = builtRows.reduce((s, r) => s + r.plants.length, 0)
  // In parallel mode some requested rows may fall outside the field and drop.
  const clipped = pattern === 'parallel' && drawnCount < count

  function handleConfirm() {
    if (!primaryCropId || drawnCount === 0) return
    onConfirm(builtRows)
  }

  return (
    <div className="absolute right-4 top-4 bottom-4 z-10 w-64 bg-white rounded-xl border border-[#e0e8d8] shadow-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] shrink-0">
        <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
          Rellenar con hileras
        </p>
        <button onClick={onCancel}
          className="w-5 h-5 flex items-center justify-center text-[#9aab8a] hover:text-red-400 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* Field size hint */}
        <div className="px-3 py-2 bg-[#f5f8f0] rounded-lg">
          <p className="text-[10px] text-[#9aab8a]">
            Campo: <span className="text-[#5a6a4a] font-medium">{dims.longFt} × {dims.shortFt} ft</span>
          </p>
        </div>

        {/* Pattern — straight rows vs contour rings (Added by Claude) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Patrón</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'parallel', label: 'Paralelas', hint: 'rectas' },
              { key: 'contour', label: 'Contorno', hint: 'sigue el borde' },
            ] as const).map(o => (
              <button key={o.key} onClick={() => setPattern(o.key)}
                className={`flex flex-col items-center gap-0.5 py-2.5 rounded-lg border text-[11px] font-medium transition-colors ${
                  pattern === o.key
                    ? 'bg-[#eaf3de] border-[#639922] text-[#2d4a1e]'
                    : 'border-[#e0e8d8] text-[#7a8a6a] hover:bg-[#f5f8f0]'
                }`}
              >
                {o.label}
                <span className="text-[9px] text-[#9aab8a] font-normal">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Parallel-only controls: orientation, row count, row length */}
        {pattern === 'parallel' && (<>
        {/* Orientation — relative to the field's own axes */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Orientación de hileras</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'long', label: 'A lo largo', hint: `~${dims.longFt} ft` },
              { key: 'short', label: 'A lo ancho', hint: `~${dims.shortFt} ft` },
            ] as const).map(o => (
              <button key={o.key}
                onClick={() => {
                  setOrientation(o.key)
                  // Added by Claude — refill the count for the new orientation
                  // (e.g. 'a lo largo' fits 10, 'a lo ancho' fits 32).
                  setCount(maxRowsThatFit(boundary, o.key, marginFt, rowSpacingFt))
                }}
                className={`flex flex-col items-center gap-0.5 py-2.5 rounded-lg border text-[11px] font-medium transition-colors ${
                  orientation === o.key
                    ? 'bg-[#eaf3de] border-[#639922] text-[#2d4a1e]'
                    : 'border-[#e0e8d8] text-[#7a8a6a] hover:bg-[#f5f8f0]'
                }`}
              >
                {o.label}
                <span className="text-[9px] text-[#9aab8a] font-normal">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Number of rows — capped to what fits (Added by Claude) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">
            Número de hileras <span className="text-[#9aab8a] font-normal">(máx {maxRows})</span>
          </label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={maxRows} value={count}
              onChange={e => setCount(Math.max(1, Math.min(maxRows, Number(e.target.value) || 1)))}
              className="w-24 px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
            />
            <span className="text-xs text-[#9aab8a]">hileras</span>
          </div>
        </div>

        {/* Row length */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Largo de hilera</label>
          <button onClick={() => setMaxLength(p => !p)}
            className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
              maxLength
                ? 'bg-[#eaf3de] border-[#639922] text-[#2d4a1e]'
                : 'border-[#d0dcc0] text-[#7a8a6a] hover:bg-[#f5f8f0]'
            }`}
          >
            <span>Máximo (rellenar el campo)</span>
            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
              maxLength ? 'border-[#639922] bg-[#639922]' : 'border-[#c0d0b0]'
            }`}>
              {maxLength && <Check size={9} className="text-white" />}
            </span>
          </button>
          {!maxLength && (
            <div className="flex items-center gap-2">
              <input type="number" min={1} value={rowLengthFt}
                onChange={e => setRowLengthFt(Math.max(1, Number(e.target.value)))}
                className="w-24 px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
              />
              <span className="text-xs text-[#9aab8a]">ft de largo</span>
            </div>
          )}
        </div>
        </>)}

        {/* Row spacing */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Espaciado entre hileras</label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} value={rowSpacingFt}
              onChange={e => setRowSpacingFt(Math.max(1, Number(e.target.value)))}
              className="w-20 px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
            />
            <span className="text-xs text-[#9aab8a]">pies</span>
          </div>
        </div>

        {/* Margin */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Margen / pasillos</label>
          <div className="flex items-center gap-2">
            <input type="number" min={0} value={marginFt}
              onChange={e => setMarginFt(Math.max(0, Number(e.target.value)))}
              className="w-20 px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
            />
            <span className="text-xs text-[#9aab8a]">pies (extremos)</span>
          </div>
        </div>

        {/* Plant spacing */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Espaciado entre plantas</label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={50} value={spacingFt}
              onChange={e => setSpacingFt(Math.max(1, Number(e.target.value)))}
              className="w-20 px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
            />
            <span className="text-xs text-[#9aab8a]">pies</span>
          </div>
        </div>

        {/* Planting date */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Fecha de siembra</label>
          <input type="date" value={plantingDate} max={todayISO()}
            onChange={e => setPlantingDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
          />
        </div>

        {/* Primary crop */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">
            Cultivo principal <span className="text-red-400">*</span>
          </label>
          <CropSelector value={primaryCropId} onChange={setPrimaryCropId} placeholder="Seleccionar cultivo" />
        </div>

        {/* Companion crop */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">
            Planta compañera <span className="text-[#9aab8a] font-normal">(opcional)</span>
          </label>
          <CropSelector value={companionCropId} onChange={setCompanionCropId} placeholder="Sin compañera" allowClear />
        </div>

        {/* Live count */}
        <div className="flex flex-col gap-1 px-3 py-2 bg-[#eaf3de] rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#639922] shrink-0" />
            <span className="text-xs text-[#3b6d11] font-medium">
              {drawnCount} {drawnCount === 1 ? 'hilera' : 'hileras'}
              {primaryCropId ? ` · ${plantCount} plantas` : ''}
            </span>
          </div>
          {clipped && (
            <span className="text-[10px] text-[#9aab8a]">
              {count - drawnCount} no caben en el campo
            </span>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-[#e0e8d8] shrink-0 flex flex-col gap-2">
        <button onClick={handleConfirm} disabled={!primaryCropId || drawnCount === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={13} /> Crear {drawnCount} {drawnCount === 1 ? 'hilera' : 'hileras'}
        </button>
        <button onClick={onCancel}
          className="w-full py-2 text-xs text-[#9aab8a] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
