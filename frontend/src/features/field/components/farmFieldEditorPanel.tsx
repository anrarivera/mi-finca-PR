import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Pencil, Check, Trash2, RotateCcw,
  Leaf, ChevronDown, ChevronUp, ChevronRight, Minus,
  Square, Pentagon, X,
  LayoutGrid, PawPrint,
} from 'lucide-react'
import { useLivestockStore } from '@/store/useLivestockStore'
import { useCreateLivestock } from '@/features/livestock/hooks/useLivestockApi'
import { getAnimalById } from '@/features/livestock/data/animalLibrary'
import LivestockFormModal from '@/features/livestock/components/livestockFormModal'
import { toast } from '@/store/useToastStore'
import type { FieldShape, FieldRow, PlantInstance, PlacedField } from '../types'
import type { EditorMode } from '../hooks/useFieldEditor'
import CropSelector from './cropSelector'
import FieldSummaryCard from './fieldSummaryCard'
import { getCropById } from '../data/cropLibrary'

type Props = {
  mode: EditorMode
  shape: FieldShape
  name: string
  /** 'crops' (rows/plants) or 'livestock' (a corral). Only choosable while
      creating a new field; existing fields keep their kind. */
  kind: 'crops' | 'livestock'
  onKindChange: (k: 'crops' | 'livestock') => void
  pointCount: number
  selectedPointIndex: number | null
  rows: FieldRow[]
  freePlants: PlantInstance[]
  selectedFreeCropId: string
  isCreatingNew: boolean
  allFields: PlacedField[]
  selectedFieldId: string | null
  /** Owning farm — herds created from the corral tools attach to it. */
  farmId: string
  onShapeChange: (s: FieldShape) => void
  onNameChange: (n: string) => void
  onStartNewField: () => void
  onStartDrawing: () => void
  onComplete: () => void
  onUndo: () => void
  onSaveField: () => void
  onCancelField: () => void
  onDeletePoint: (i: number) => void
  onStartFillRows: () => void
  onStartAddFreePlant: (cropId: string) => void
  onStopAddFreePlant: () => void
  onEditRows: (ids: string[]) => void
  onDeleteRows: (ids: string[]) => void
  onSelectField: (id: string) => void
  /** Card double-click / Editar button — enter edit mode for this field. */
  onEditFieldById: (id: string) => void
  /** Card delete (already confirmed in-card). */
  onDeleteFieldById: (id: string) => void
  /** Canonical selection — plant ids, shared with the map (two-way). */
  selectedPlantIds: Set<string>
  /** Replace the whole selection (Todos / Ninguno). */
  onChangeSelection: (next: Set<string>) => void
  /** Toggle a whole row — same as clicking its line on the map. */
  onToggleRowSelected: (rowId: string) => void
  /** Toggle a single plant — same as clicking its dot on the map. */
  onTogglePlantSelected: (plantId: string) => void
  /** Delete the selection: full rows + loose plants (reason asked if planted). */
  onDeleteSelection: (rowIds: string[], plantIds: string[]) => void
  /** Map plant click — expand that row and scroll it into view. */
  reveal?: { rowId: string; nonce: number } | null
}

export default function FarmFieldEditorPanel({
  mode, shape, name, kind, onKindChange,
  pointCount, selectedPointIndex,
  rows, freePlants,
  allFields, selectedFieldId, isCreatingNew, farmId,
  onShapeChange, onNameChange,
  onStartNewField, onStartDrawing, onComplete, onUndo,
  onSaveField, onCancelField, onDeletePoint,
  onStartFillRows,
  onStartAddFreePlant, onStopAddFreePlant,
  onEditRows, onDeleteRows,
  onSelectField, onEditFieldById, onDeleteFieldById,
  selectedPlantIds, onChangeSelection,
  onToggleRowSelected, onTogglePlantSelected,
  onDeleteSelection, reveal,
}: Props) {
  const { t } = useTranslation('editor')
  const [freeCropPick, setFreeCropPick] = useState('')
  const [showRows, setShowRows] = useState(true)
  // Rows expanded to show their individual plants.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // A plant was clicked on the map — open its row and bring it into view.
  useEffect(() => {
    if (!reveal) return
    setExpandedRows(prev => new Set(prev).add(reveal.rowId))
    requestAnimationFrame(() => {
      rowRefs.current[reveal.rowId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.nonce])

  const toggleExpand = (rowId: string) =>
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })

  // Selection views: every plant id, rows fully covered, and the loose
  // plants outside those rows (mirrors the operations scope selector).
  const allPlantIds = [
    ...rows.flatMap(r => r.plants.map(p => p.id)),
    ...freePlants.map(p => p.id),
  ]
  const allSelected = allPlantIds.length > 0 && allPlantIds.every(id => selectedPlantIds.has(id))
  const fullRows = rows.filter(r =>
    r.plants.length > 0 && r.plants.every(p => selectedPlantIds.has(p.id))
  )
  const fullRowIds = fullRows.map(r => r.id)
  const coveredByFullRows = new Set(fullRows.flatMap(r => r.plants.map(p => p.id)))
  const loosePlantIds = [...selectedPlantIds].filter(id => !coveredByFullRows.has(id))

  const isIdle = mode === 'setup' && !isCreatingNew
  // Corral (livestock) fields have no rows/plants — the crop tools hide.
  const isLivestock = kind === 'livestock'
  // Herds assigned to the corral being edited + the add-animals modal
  const livestockUnits = useLivestockStore(s => s.units)
  const corralHerds = isLivestock && selectedFieldId
    ? livestockUnits.filter(u => u.fieldId === selectedFieldId)
    : []
  const [addingAnimals, setAddingAnimals] = useState(false)
  const createLivestock = useCreateLivestock()

  // ── SETUP — field summary cards (same cards as the farm-map drawer).
  //    Single click selects on the canvas, double click / "Editar" enters
  //    edit mode, and each card carries its own Operaciones button. ──────
  if (isIdle) {
    return (
      <div className="w-full sm:w-72 h-full bg-white border-t sm:border-t-0 sm:border-r border-[#e0e8d8] flex flex-col">
        <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] shrink-0">
          <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
            {t('panel.farmFields')}
          </p>
          <p className="text-[10px] text-[#66755a] mt-0.5">
            {t('panel.fieldCount', { count: allFields.length })}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {allFields.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
              <Square size={24} className="text-[#c0d8a0]" strokeWidth={1.5} />
              <p className="text-xs text-[#66755a]">
                {t('panel.noFields')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[#f0f5e8]">
              {allFields.map(field => (
                <FieldSummaryCard
                  key={field.id}
                  field={field}
                  focused={field.id === selectedFieldId}
                  onSelect={() => onSelectField(field.id)}
                  onOpenEditor={() => onEditFieldById(field.id)}
                  onDelete={() => onDeleteFieldById(field.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#e0e8d8] shrink-0">
          <button
            onClick={onStartNewField}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
          >
            <Plus size={13} /> {t('panel.newField')}
          </button>
        </div>
      </div>
    )
  }

  // ── DRAWING / EDITING A FIELD ─────────────────────────────────────
  return (
    <div className="w-full sm:w-64 h-full bg-white border-t sm:border-t-0 sm:border-r border-[#e0e8d8] flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
            {selectedFieldId ? t('panel.editingField') : t('panel.newField')}
          </p>
          <button onClick={onCancelField}
            className="text-[#66755a] hover:text-red-400 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">

        {/* Field name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[#5a6a4a]">
            {t('panel.name')} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            placeholder={t('panel.namePlaceholder')}
            maxLength={80}
            value={name}
            onChange={e => onNameChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
          />
        </div>

        {/* ── SETUP mode ── */}
        {(mode === 'setup' || isCreatingNew) && !isIdle && (
          <>
            {/* Kind toggle — only while creating; existing fields keep it */}
            {selectedFieldId === null && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5a6a4a]">{t('corral.kindLabel')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['crops', 'livestock'] as const).map(k => (
                    <button key={k} onClick={() => onKindChange(k)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                        kind === k
                          ? 'bg-[#eaf3de] border-[#639922] text-[#2d4a1e]'
                          : 'border-[#e0e8d8] text-[#5a6a4a] hover:bg-[#f5f8f0]'
                      }`}
                    >
                      <span className="text-lg" aria-hidden>{k === 'crops' ? '🌱' : '🐄'}</span>
                      {k === 'crops' ? t('corral.crops') : t('corral.livestock')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">{t('panel.shape')}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['rectangle', 'polygon'] as FieldShape[]).map(s => (
                  <button key={s} onClick={() => onShapeChange(s)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors ${
                      shape === s
                        ? 'bg-[#eaf3de] border-[#639922] text-[#2d4a1e]'
                        : 'border-[#e0e8d8] text-[#5a6a4a] hover:bg-[#f5f8f0]'
                    }`}
                  >
                    {s === 'rectangle'
                      ? <Square size={18} strokeWidth={1.5} />
                      : <Pentagon size={18} strokeWidth={1.5} />
                    }
                    {s === 'rectangle' ? t('panel.rectangle') : t('panel.polygon')}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={onStartDrawing} disabled={!name.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Pencil size={13} />
              {shape === 'rectangle' ? t('panel.drawRectangle') : t('panel.drawPolygon')}
            </button>
          </>
        )}

        {/* ── DRAWING mode ── */}
        {mode === 'drawing' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse shrink-0" />
              <span className="text-xs text-[#3b6d11] font-medium">
                {shape === 'rectangle'
                  ? t('panel.clickAndDrag')
                  : t('panel.pointsPlaced', { count: pointCount })}
              </span>
            </div>
            {shape === 'polygon' && (
              <div className="flex flex-col gap-1.5 text-xs text-[#5a6a4a] bg-[#f5f8f0] rounded-lg p-3">
                <p>{t('panel.polyHintAdd')}</p>
                <p>{t('panel.polyHintClose')}</p>
                <p>{t('panel.polyHintUndo')}</p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {shape === 'polygon' && (
                <>
                  <button onClick={onComplete} disabled={pointCount < 3}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#639922] text-white rounded-lg text-xs font-medium hover:bg-[#3b6d11] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Check size={13} /> {t('panel.completeShape')}
                  </button>
                  <button onClick={onUndo} disabled={pointCount === 0}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#5a6a4a] hover:bg-[#f5f8f0] rounded-lg transition-colors disabled:opacity-40"
                  >
                    <RotateCcw size={13} /> {t('panel.undoLastPoint')}
                  </button>
                </>
              )}
              <button onClick={onCancelField}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#66755a] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} /> {t('common.cancel')}
              </button>
            </div>
          </>
        )}

        {/* ── COMPLETE mode ── */}
        {mode === 'complete' && (
          <>
            {selectedPointIndex !== null && selectedPointIndex >= 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs text-red-600 font-medium">
                    {t('panel.pointSelected', { number: selectedPointIndex + 1 })}
                  </span>
                </div>
                <button onClick={() => onDeletePoint(selectedPointIndex)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  {t('panel.delete')}
                </button>
              </div>
            )}

            {!isLivestock && (rows.length > 0 || freePlants.length > 0) && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <button onClick={() => setShowRows(p => !p)}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#5a6a4a]"
                  >
                    <span>{t('panel.rowsAndPlants')}</span>
                    {showRows ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showRows && (
                    <button
                      onClick={() => onChangeSelection(
                        allSelected ? new Set() : new Set(allPlantIds)
                      )}
                      className="text-[10px] text-[#4d7a1b] hover:text-[#2d4a1e] transition-colors"
                    >
                      {allSelected ? t('panel.none') : t('panel.all')}
                    </button>
                  )}
                </div>

                {showRows && selectedPlantIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    {fullRowIds.length > 0 && (
                      <button onClick={() => onEditRows(fullRowIds)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#4d7a1b] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
                      >
                        <Pencil size={10} /> {t('panel.editCount', { count: fullRowIds.length })}
                      </button>
                    )}
                    <button onClick={() => onDeleteSelection(fullRowIds, loosePlantIds)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#66755a] border border-[#e0e8d8] rounded-lg hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={10} /> {t('panel.deleteCount', { count: selectedPlantIds.size })}
                    </button>
                  </div>
                )}

                {showRows && (
                  <div className="flex flex-col gap-1.5">
                    {rows.map((row, i) => {
                      const primary = getCropById(row.primaryCropTypeId)
                      const companion = row.companionCropTypeId
                        ? getCropById(row.companionCropTypeId) : null
                      const selCount = row.plants.filter(p => selectedPlantIds.has(p.id)).length
                      const checked = row.plants.length > 0 && selCount === row.plants.length
                      const some = selCount > 0 && !checked
                      const expanded = expandedRows.has(row.id)
                      return (
                        <div key={row.id}
                          ref={el => { rowRefs.current[row.id] = el }}
                          className={`bg-white border rounded-lg transition-colors ${
                            checked || some ? 'border-[#639922] bg-[#f5f8f0]' : 'border-[#e8f0e0]'
                          }`}
                        >
                          <div className="flex items-center gap-2 px-2.5 py-2">
                            <button onClick={() => onToggleRowSelected(row.id)}
                              title={checked ? t('panel.deselectRow') : t('panel.selectRow')}
                              className={`w-4 h-4 pointer-coarse:w-6 pointer-coarse:h-6 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                checked || some
                                  ? 'bg-[#639922] border-[#639922]'
                                  : 'border-[#c0d0b0] hover:border-[#639922]'
                              }`}
                            >
                              {checked && <Check size={10} className="text-white" />}
                              {some && <Minus size={10} className="text-white" />}
                            </button>

                            <button
                              onClick={() => toggleExpand(row.id)}
                              className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                              title={t('panel.viewRowPlants')}
                            >
                              {expanded
                                ? <ChevronDown size={11} className="text-[#66755a] shrink-0" />
                                : <ChevronRight size={11} className="text-[#66755a] shrink-0" />}
                              <span className="text-xs text-[#66755a]">#{i + 1}</span>
                              <span className="text-sm">{primary?.emoji}</span>
                              {companion && (
                                <>
                                  <span className="text-[10px] text-[#66755a]">+</span>
                                  <span className="text-sm">{companion.emoji}</span>
                                </>
                              )}
                              <span className={`text-[10px] shrink-0 ml-auto ${
                                some ? 'text-[#4d7a1b] font-medium' : 'text-[#66755a]'
                              }`}>
                                {selCount}/{row.plants.length}
                              </span>
                            </button>

                            <button onClick={() => onEditRows([row.id])}
                              className="p-0.5 pointer-coarse:p-2 text-[#66755a] hover:text-[#4d7a1b] transition-colors shrink-0"
                              title={t('panel.editRow')}
                            >
                              <Pencil size={11} />
                            </button>
                            <button onClick={() => onDeleteRows([row.id])}
                              className="p-0.5 pointer-coarse:p-2 text-[#66755a] hover:text-red-400 transition-colors shrink-0"
                              title={t('panel.deleteRow')}
                            >
                              <X size={11} />
                            </button>
                          </div>

                          {/* Individual plants — same checkboxes as the map dots */}
                          {expanded && (
                            <div className="px-2.5 pb-2 pl-8 grid grid-cols-2 gap-x-2 gap-y-0.5">
                              {row.plants.map((plant, pi) => (
                                <label
                                  key={plant.id}
                                  className="flex items-center gap-1 text-[10px] text-[#5a6a4a] cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedPlantIds.has(plant.id)}
                                    onChange={() => onTogglePlantSelected(plant.id)}
                                    className="accent-[#639922]"
                                  />
                                  {t('panel.plantN', { number: pi + 1 })}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Free-standing plants */}
                    {freePlants.length > 0 && (
                      <div className="bg-white border border-[#e8f0e0] rounded-lg px-2.5 py-2">
                        <p className="text-[10px] font-medium text-[#5a6a4a] mb-1">
                          {t('panel.freePlants')}
                        </p>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                          {freePlants.map((plant, pi) => {
                            const crop = getCropById(plant.cropTypeId)
                            return (
                              <label
                                key={plant.id}
                                className="flex items-center gap-1 text-[10px] text-[#5a6a4a] cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPlantIds.has(plant.id)}
                                  onChange={() => onTogglePlantSelected(plant.id)}
                                  className="accent-[#639922]"
                                />
                                {crop?.emoji ?? '🌱'} {t('panel.plantN', { number: pi + 1 })}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-[#f0f5e8]">
              {/* Corral: herds live here — add animals without leaving the
                  editor (same form the Cuaderno uses, locked to this
                  corral). New corrales must be saved first: herds attach
                  to a real field id. */}
              {isLivestock && (
                <>
                  {corralHerds.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {corralHerds.map(u => {
                        const animal = getAnimalById(u.animalType)
                        return (
                          <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 bg-[#f5f8f0] rounded-lg min-w-0">
                            <span className="text-sm shrink-0" aria-hidden>{animal?.emoji ?? '🐾'}</span>
                            <span className="text-[11px] font-medium text-[#2d4a1e] truncate flex-1 min-w-0">{u.name}</span>
                            <span className="text-[10px] text-[#5a6a4a] shrink-0">{u.currentCount}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {selectedFieldId ? (
                    <button
                      onClick={() => setAddingAnimals(true)}
                      className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#8B7355] border border-[#e0d8c8] rounded-lg hover:bg-[#f5efe5] transition-colors"
                    >
                      <PawPrint size={13} /> {t('corral.addAnimals')}
                    </button>
                  ) : (
                    <p className="text-[10px] text-[#66755a] leading-relaxed">
                      {t('corral.saveFirst')}
                    </p>
                  )}
                  {addingAnimals && selectedFieldId && (
                    <LivestockFormModal
                      unit={null}
                      farms={[]}
                      fixedFarmId={farmId}
                      fixedFieldId={selectedFieldId}
                      onClose={() => setAddingAnimals(false)}
                      onSave={(data) => {
                        createLivestock.mutate(data, {
                          onSuccess: () => toast.success(t('livestock.added', { name: data.name })),
                        })
                        setAddingAnimals(false)
                      }}
                    />
                  )}
                </>
              )}

              {/* Crop tools — a corral only needs boundary + name */}
              {!isLivestock && (
                <>
                  <button onClick={onStartFillRows}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#4d7a1b] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
                  >
                    <LayoutGrid size={13} /> {t('panel.fillWithRows')}
                  </button>

                  <div className="flex flex-col gap-1.5">
                    <CropSelector
                      value={freeCropPick}
                      onChange={setFreeCropPick}
                      placeholder={t('panel.chooseFreePlant')}
                    />
                    <button
                      onClick={() => { if (freeCropPick) { onStartAddFreePlant(freeCropPick) } }}
                      disabled={!freeCropPick}
                      className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#4d7a1b] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Leaf size={13} /> {t('panel.placeFreePlant')}
                    </button>
                  </div>

                  <div className="h-px bg-[#f0f5e8]" />
                </>
              )}

              <button onClick={onSaveField} disabled={!name.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={13} /> {t('panel.saveField')}
              </button>
              <button onClick={onCancelField}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#66755a] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={13} /> {t('common.cancel')}
              </button>
            </div>
          </>
        )}

        {/* ── FILL ROWS mode ── */}
        {mode === 'fillRows' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
            <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse shrink-0" />
            <span className="text-xs text-[#3b6d11] font-medium">
              {t('panel.adjustFill')}
            </span>
          </div>
        )}

        {/* ── ADD FREE PLANT mode ── */}
        {mode === 'addFreePlant' && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#eaf3de] rounded-lg">
              <div className="w-2 h-2 rounded-full bg-[#639922] animate-pulse shrink-0" />
              <span className="text-xs text-[#3b6d11] font-medium">
                {t('panel.clickToPlacePlants')}
              </span>
            </div>
            <button onClick={onStopAddFreePlant}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Check size={13} /> {t('panel.finishPlacing')}
            </button>
          </>
        )}

      </div>
    </div>
  )
}