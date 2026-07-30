import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bug } from 'lucide-react'
import type { FieldRow, PlantInstance } from '@/features/field/types'
import {
  HarvestSelector, plantSetToSelection,
} from '@/features/field/components/operationsView'
import { useCreateFinding } from '../hooks/useFindingsApi'
import { pestsForCrops, type PestType } from '../data/pestLibrary'
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../types'
import { fieldScopeTargets } from '../utils/findingScope'
import { toast } from '@/store/useToastStore'

// ──────────────────────────────────────────────────────────────────────────
// "Registrar hallazgo" — capture a pest observation: pest + severity +
// where. Modeled on the check-off modal: portaled to <body> (hosts render
// it from inside the farm drawer, whose slide transform would otherwise
// hijack position:fixed), docked right with a click-through backdrop so the
// affected rows/plants can be tapped right on the imagery.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  farmId: string
  fieldId: string
  fieldRows: FieldRow[]
  freePlants: PlantInstance[]
  onClose: () => void
}

export default function FindingModal({
  farmId, fieldId, fieldRows, freePlants, onClose,
}: Props) {
  const today = new Date().toISOString().split('T')[0]
  const createFinding = useCreateFinding(farmId)

  const targets = useMemo(
    () => fieldScopeTargets({ rows: fieldRows, freePlants }),
    [fieldRows, freePlants]
  )

  // Pests targeting the field's crops come first in the picker.
  const fieldCrops = useMemo(() => {
    const ids = new Set<string>()
    for (const row of fieldRows) {
      ids.add(row.primaryCropTypeId)
      if (row.companionCropTypeId) ids.add(row.companionCropTypeId)
    }
    for (const p of freePlants) ids.add(p.cropTypeId)
    return [...ids]
  }, [fieldRows, freePlants])
  const { suggested, others } = useMemo(
    () => pestsForCrops(fieldCrops), [fieldCrops]
  )

  const [pestId, setPestId] = useState('')
  const [severity, setSeverity] = useState(1)
  const [foundDate, setFoundDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [selectedPlants, setSelectedPlants] = useState<Set<string>>(new Set())

  const hasTargets = targets.rows.length > 0 || targets.freePlants.length > 0
  // The map sits behind both hosts (farm drawer card, operations drawer) —
  // let clicks through so plants/rows can be tapped on the imagery.
  const clickThrough = hasTargets

  function handleConfirm() {
    if (!pestId) return
    createFinding.mutate(
      {
        fieldId,
        pestId,
        severity,
        foundDate,
        notes: notes || undefined,
        ...plantSetToSelection(targets, selectedPlants),
      },
      {
        onSuccess: () => toast.success('Hallazgo registrado'),
      }
    )
    onClose()
  }

  const renderOptions = (pests: PestType[]) =>
    pests.map(p => (
      <option key={p.id} value={p.id}>
        {p.emoji} {p.nameEs}
      </option>
    ))

  return createPortal(
    <>
      {/* Backdrop — light and click-through over the map, like the
          check-off modal's scope-selection state */}
      <div
        className={`fixed inset-0 z-[2200] ${
          clickThrough ? 'bg-black/10 pointer-events-none' : 'bg-black/40 backdrop-blur-sm'
        }`}
        onClick={clickThrough ? undefined : onClose}
      />

      <div className={`fixed inset-0 z-[2300] flex items-center p-4 pointer-events-none ${
        hasTargets ? 'justify-end pr-6' : 'justify-center'
      }`}>
        <div
          className="bg-white rounded-2xl shadow-xl overflow-hidden max-h-[92vh] overflow-y-auto pointer-events-auto"
          style={{ width: 300, maxWidth: '100%' }}
        >

          {/* Header */}
          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0]">
            <p className="text-sm font-semibold text-[#2d4a1e] flex items-center gap-1.5">
              <Bug size={14} className="text-[#639922]" /> Registrar hallazgo
            </p>
            <p className="text-[10px] text-[#9aab8a] mt-1">
              Anota la plaga o enfermedad y dónde la viste. Sin selección =
              observación de todo el campo.
            </p>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">

            {/* Pest picker — field's crops' pests first */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Plaga o enfermedad
              </label>
              <select
                value={pestId}
                onChange={e => setPestId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors bg-white"
              >
                <option value="" disabled>Selecciona…</option>
                {suggested.length > 0 && (
                  <optgroup label="Sugeridas para este campo">
                    {renderOptions(suggested)}
                  </optgroup>
                )}
                <optgroup label={suggested.length > 0 ? 'Otras' : 'Plagas'}>
                  {renderOptions(others)}
                </optgroup>
              </select>
            </div>

            {/* Severity — 1 leve · 2 moderada · 3 severa */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Severidad
              </label>
              <div className="flex gap-2">
                {[1, 2, 3].map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setSeverity(level)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      severity === level
                        ? 'text-white border-transparent'
                        : 'text-[#5a6a4a] border-[#d0dcc0] hover:bg-[#f5f8f0]'
                    }`}
                    style={severity === level
                      ? { backgroundColor: SEVERITY_COLORS[level] }
                      : undefined}
                  >
                    {SEVERITY_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Fecha del hallazgo
              </label>
              <input
                type="date"
                value={foundDate}
                max={today}
                onChange={e => setFoundDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
              />
            </div>

            {/* Where — same selector as operations, map taps included */}
            {hasTargets && (
              <HarvestSelector
                title="¿Dónde lo encontraste?"
                targets={targets}
                selected={selectedPlants}
                onChange={setSelectedPlants}
                mapToggles={clickThrough}
                fieldId={fieldId}
              />
            )}

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Notas
                <span className="text-[#9aab8a] font-normal ml-1">(opcional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Qué viste, cuántas plantas, condiciones..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] transition-colors resize-none"
              />
            </div>

          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-[#e0e8d8] flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2 text-sm text-[#5a6a4a] hover:bg-[#f0f5e8] rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!pestId}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-sm font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Bug size={14} />
              Registrar
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
