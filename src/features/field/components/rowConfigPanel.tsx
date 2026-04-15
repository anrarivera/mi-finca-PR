import { useState, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import CropSelector from './cropSelector'
import {
  canvasToLatlng,
  calculateRowPlantPositions,
  CANVAS_W, CANVAS_H,
} from '../utils/canvasGeo'
import type { BBox } from '../utils/canvasGeo'
import { todayISO } from '../types'
import type { FieldRow, PlantInstance } from '../types'

type RowDraft = {
  startX: number; startY: number
  endX: number; endY: number
}

type Props = {
  rowDraft: RowDraft
  bbox: BBox   // ← needed to convert canvas pixels to lat/lng
  onConfirm: (row: FieldRow) => void
  onCancel: () => void
}

export default function RowConfigPanel({ rowDraft, bbox, onConfirm, onCancel }: Props) {
  const [primaryCropId, setPrimaryCropId] = useState('')
  const [companionCropId, setCompanionCropId] = useState('')
  const [spacingFt, setSpacingFt] = useState(6)
  const [plantingDate, setPlantingDate] = useState(todayISO())
  const [plantCount, setPlantCount] = useState(0)

  // Convert draft canvas points to lat/lng
  const startGeo = canvasToLatlng(rowDraft.startX, rowDraft.startY, bbox)
  const endGeo = canvasToLatlng(rowDraft.endX, rowDraft.endY, bbox)

  useEffect(() => {
    if (!primaryCropId) { setPlantCount(0); return }
    const positions = calculateRowPlantPositions(
      startGeo.lat, startGeo.lng,
      endGeo.lat, endGeo.lng,
      spacingFt
    )
    setPlantCount(positions.length)
  }, [primaryCropId, spacingFt, rowDraft, bbox])

  function handleConfirm() {
    if (!primaryCropId) return
    const rowId = `row_${Date.now()}`

    const positions = calculateRowPlantPositions(
      startGeo.lat, startGeo.lng,
      endGeo.lat, endGeo.lng,
      spacingFt
    )

    const plants: PlantInstance[] = positions.map((pos, i) => {
      const isCompanion = companionCropId && i % 2 !== 0
      return {
        id: `${rowId}_plant_${i}`,
        cropTypeId: isCompanion ? companionCropId : primaryCropId,
        lat: pos.lat,
        lng: pos.lng,
        plantingDate,
      }
    })

    const row: FieldRow = {
      id: rowId,
      startLat: startGeo.lat,
      startLng: startGeo.lng,
      endLat: endGeo.lat,
      endLng: endGeo.lng,
      spacingFt,
      primaryCropTypeId: primaryCropId,
      companionCropTypeId: companionCropId || null,
      plants,
      plantingDate,
    }

    onConfirm(row)
  }

  return (
    <div className="absolute right-4 top-4 z-10 w-60 bg-white rounded-xl border border-[#e0e8d8] shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0]">
        <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
          Configurar hilera
        </p>
        <button onClick={onCancel}
          className="w-5 h-5 flex items-center justify-center text-[#9aab8a] hover:text-red-400 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Fecha de siembra</label>
          <input
            type="date" value={plantingDate} max={todayISO()}
            onChange={e => setPlantingDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">Espaciado entre plantas</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={50} value={spacingFt}
              onChange={e => setSpacingFt(Math.max(1, Number(e.target.value)))}
              className="w-20 px-2 py-1.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
            />
            <span className="text-xs text-[#9aab8a]">pies</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">
            Cultivo principal <span className="text-red-400">*</span>
          </label>
          <CropSelector value={primaryCropId} onChange={setPrimaryCropId} placeholder="Seleccionar cultivo" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">
            Planta compañera <span className="text-[#9aab8a] font-normal">(opcional)</span>
          </label>
          <CropSelector value={companionCropId} onChange={setCompanionCropId} placeholder="Sin compañera" allowClear />
        </div>

        {primaryCropId && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
            <div className="w-2 h-2 rounded-full bg-[#639922]" />
            <span className="text-xs text-[#3b6d11] font-medium">
              {plantCount} plantas en esta hilera
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button onClick={handleConfirm} disabled={!primaryCropId}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={13} /> Confirmar hilera
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