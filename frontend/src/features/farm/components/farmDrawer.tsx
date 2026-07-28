import { useState, useEffect, useRef } from 'react'
import {
  ChevronRight, ChevronLeft, Star, Plus,
  MapPin, Layers, Pencil, Trash2,
  ToggleLeft, ToggleRight, AlertCircle, Clock,
} from 'lucide-react'
import { useDeleteField } from '@/features/field/hooks/useFieldsApi'
import { useCompleteRecommendedOp } from '@/features/field/hooks/useOperationsApi'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { computeCropSummary } from '@/features/field/utils/rowCalculator'
import { getFieldOperationHealth } from '@/features/field/utils/operationStatus'
import { getCropById } from '@/features/field/data/cropLibrary'
import { CheckOffModal, harvestTargetsForOperation } from '@/features/field/components/operationsView'
import type { Farm } from '@/store/useFarmStore'
import type { PlacedField, PlantingEvent, RecommendedOperation } from '@/features/field/types'

// The most urgent open calendar item for a field: overdue first (oldest
// first), then upcoming (soonest first). Drives the check-off shortcut on
// each field card.
function nextOperation(field: PlacedField): {
  op: RecommendedOperation
  event: PlantingEvent
} | null {
  const open = (field.plantingEvents ?? []).flatMap(event =>
    event.operations
      .filter(op => op.status === 'due' || op.status === 'pending')
      .map(op => ({ op, event }))
  )
  if (open.length === 0) return null
  open.sort((a, b) => {
    if (a.op.status !== b.op.status) return a.op.status === 'due' ? -1 : 1
    return a.op.recommendedDate.localeCompare(b.op.recommendedDate)
  })
  return open[0]
}
import { areaFt2, ft2ToAcres, getCanvasScale, latlngToCanvas, farmBoundaryToBBox } from '@/features/field/utils/canvasGeo'
import { toast } from '@/store/useToastStore'

type Props = {
  onAddFarm: () => void
  onEditField: (fieldId: string) => void
  onDeleteField: (fieldId: string) => void
  onFlyToFarm: (farm: Farm) => void
  onOpenFieldEditor: (farmId: string) => void
  /** Set on a map field click: opens the drawer focused on that field.
      The nonce lets the same field re-trigger after the drawer closes. */
  focusRequest?: { fieldId: string; nonce: number } | null
  /** Card click → select that field on the map (two-way selection). */
  onSelectField: (fieldId: string) => void
}

export default function FarmDrawer({
  onAddFarm, onEditField, onDeleteField,
  onFlyToFarm, onOpenFieldEditor, focusRequest, onSelectField,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [level, setLevel] = useState<'farms' | 'fields'>('farms')

  // A field was clicked on the map — open the drawer at the fields level;
  // the matching card highlights and scrolls into view.
  useEffect(() => {
    if (!focusRequest) return
    setIsOpen(true)
    setLevel('fields')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce])

  const {
    farms, activeFarm, activeFarmId, favoriteFarmId,
    setActiveFarm, setFavoriteFarm, deleteFarm,
  } = useFarmStore()
  const { getFieldsByFarmId, updateField, removeFieldsByFarmId } = useFieldStore()

  // Auto-navigate to fields level when only one farm
  useEffect(() => {
    if (farms.length === 1 && level === 'farms') {
      setActiveFarm(farms[0])
      setLevel('fields')
    }
  }, [farms.length])

  // When active farm changes, show its fields
  useEffect(() => {
    if (activeFarm) setLevel('fields')
  }, [activeFarmId])

  function handleSelectFarm(farm: Farm) {
    setActiveFarm(farm)
    onFlyToFarm(farm)
    setLevel('fields')
  }

  function handleBackToFarms() {
    setLevel('farms')
  }

  function handleDeleteFarm(farm: Farm) {
    if (!window.confirm(`¿Eliminar la finca "${farm.name}" y todos sus campos?`)) return
    removeFieldsByFarmId(farm.id)
    deleteFarm(farm.id)
    if (farms.length <= 1) setLevel('farms')
  }

  const fields = activeFarm ? getFieldsByFarmId(activeFarm.id) : []

  // Total overdue across all fields of active farm
  const totalOverdue = fields.reduce((sum, f) => {
    const health = getFieldOperationHealth(f.plantingEvents ?? [])
    return sum + health.overdue
  }, 0)

  return (
    <>
      {/* ── Drawer toggle tab ─────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(p => !p)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-[1001] bg-white border border-[#e0e8d8] border-l-0 rounded-r-lg px-1.5 py-4 flex flex-col items-center gap-1.5 shadow-md hover:bg-[#f5f8f0] transition-all"
        style={{
          marginLeft: isOpen ? 300 : 0,
          transition: 'margin-left 0.3s ease',
        }}
      >
        {isOpen
          ? <ChevronLeft size={14} className="text-[#639922]" />
          : <ChevronRight size={14} className="text-[#639922]" />
        }
        <span
          className="text-[9px] font-semibold text-[#5a6a4a] uppercase tracking-wide"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {level === 'fields' && activeFarm ? activeFarm.name : 'Fincas'}
        </span>
        {/* Badge — total overdue operations */}
        {totalOverdue > 0 && (
          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-[9px] text-white font-bold">{totalOverdue}</span>
          </div>
        )}
        {totalOverdue === 0 && farms.length > 0 && (
          <div className="w-4 h-4 rounded-full bg-[#639922] flex items-center justify-center">
            <span className="text-[9px] text-white font-bold">{farms.length}</span>
          </div>
        )}
      </button>

      {/* ── Drawer panel ─────────────────────────────────────────── */}
      <div
        className="absolute left-0 top-0 h-full z-[1000] bg-white border-r border-[#e0e8d8] shadow-xl flex flex-col overflow-hidden"
        style={{
          width: 300,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
        }}
      >
        {level === 'farms'
          ? <FarmList
              farms={farms}
              favoriteFarmId={favoriteFarmId}
              onSelect={handleSelectFarm}
              onSetFavorite={setFavoriteFarm}
              onDelete={handleDeleteFarm}
              onAddFarm={onAddFarm}
              onClose={() => setIsOpen(false)}
            />
          : activeFarm
          ? <FieldList
              farm={activeFarm}
              fields={fields}
              focusFieldId={focusRequest?.fieldId ?? null}
              focusNonce={focusRequest?.nonce ?? 0}
              onSelectField={onSelectField}
              showBackButton={farms.length > 1}
              onBack={handleBackToFarms}
              onClose={() => setIsOpen(false)}
              onEditField={onEditField}
              onDeleteField={(fieldId) => {
                onDeleteField(fieldId)
              }}
              onToggleDisplay={(field) => {
                updateField(field.id, {
                  displayMode: field.displayMode === 'pin' ? 'shape' : 'pin'
                })
              }}
              onOpenFieldEditor={() => onOpenFieldEditor(activeFarm.id)}
            />
          : null
        }
      </div>
    </>
  )
}

// ── Level 1: Farm list ────────────────────────────────────────────────
function FarmList({
  farms, favoriteFarmId, onSelect, onSetFavorite,
  onDelete, onAddFarm, onClose,
}: {
  farms: Farm[]
  favoriteFarmId: string | null
  onSelect: (farm: Farm) => void
  onSetFavorite: (id: string) => void
  onDelete: (farm: Farm) => void
  onAddFarm: () => void
  onClose: () => void
}) {
  const { getFieldsByFarmId } = useFieldStore()

  // Sort farms — favorite first
  const sorted = [...farms].sort((a, b) => {
    if (a.id === favoriteFarmId) return -1
    if (b.id === favoriteFarmId) return 1
    return 0
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center justify-between shrink-0">
        <div>
          <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
            Mis fincas
          </p>
          <p className="text-[10px] text-[#9aab8a] mt-0.5">
            {farms.length} {farms.length === 1 ? 'finca' : 'fincas'}
          </p>
        </div>
        <button onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-[#9aab8a] hover:bg-[#e8f0e0] transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* Scrollable farm list */}
      <div className="flex-1 overflow-y-auto">
        {farms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
            <MapPin size={24} className="text-[#c0d8a0]" strokeWidth={1.5} />
            <p className="text-xs text-[#9aab8a]">
              No tienes fincas todavía. Añade tu primera finca.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#f0f5e8]">
            {sorted.map(farm => {
              const farmFields = getFieldsByFarmId(farm.id)
              const isFavorite = farm.id === favoriteFarmId
              const totalOverdue = farmFields.reduce((sum, f) => {
                const h = getFieldOperationHealth(f.plantingEvents ?? [])
                return sum + h.overdue
              }, 0)
              const totalDueSoon = farmFields.reduce((sum, f) => {
                const h = getFieldOperationHealth(f.plantingEvents ?? [])
                return sum + h.dueSoon
              }, 0)

              return (
                <div key={farm.id} className="group">
                  <button
                    onClick={() => onSelect(farm)}
                    className="w-full text-left px-4 py-3.5 hover:bg-[#fafcf8] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {isFavorite && (
                            <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-[#2d4a1e] truncate">
                            {farm.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <MapPin size={10} className="text-[#9aab8a] shrink-0" />
                          <span className="text-[10px] text-[#9aab8a] truncate">
                            {farm.location}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-[#7a8a6a]">
                            <Layers size={9} className="inline mr-1" />
                            {farmFields.length} {farmFields.length === 1 ? 'campo' : 'campos'}
                          </span>
                          {farm.boundary?.length > 0 && (
                            <span className="text-[10px] text-[#7a8a6a]">
                              {farm.totalAreaAcres > 0 ? `${farm.totalAreaAcres} ac` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Operation health badges */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {totalOverdue > 0 && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-red-50 rounded-full">
                            <AlertCircle size={9} className="text-red-500" />
                            <span className="text-[9px] text-red-600 font-bold">{totalOverdue}</span>
                          </div>
                        )}
                        {totalDueSoon > 0 && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 rounded-full">
                            <Clock size={9} className="text-amber-500" />
                            <span className="text-[9px] text-amber-600 font-bold">{totalDueSoon}</span>
                          </div>
                        )}
                        <ChevronRight size={14} className="text-[#c0d0b0] mt-1" />
                      </div>
                    </div>
                  </button>

                  {/* Farm actions — visible on hover */}
                  <div className="hidden group-hover:flex items-center gap-1 px-4 pb-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSetFavorite(farm.id) }}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                        isFavorite
                          ? 'text-amber-500 bg-amber-50'
                          : 'text-[#9aab8a] hover:text-amber-500 hover:bg-amber-50'
                      }`}
                      title={isFavorite ? 'Finca favorita' : 'Marcar como favorita'}
                    >
                      <Star size={10} className={isFavorite ? 'fill-amber-400' : ''} />
                      {isFavorite ? 'Favorita' : 'Favorita'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(farm) }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#9aab8a] hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={10} /> Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Fixed bottom — Add farm button */}
      <div className="px-4 py-3 border-t border-[#e0e8d8] bg-white shrink-0">
        <button
          onClick={onAddFarm}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
        >
          <Plus size={13} /> Añadir finca
        </button>
      </div>
    </div>
  )
}

// ── Level 2: Field list for a farm ────────────────────────────────────
function FieldList({
  farm, fields, focusFieldId, focusNonce, onSelectField, showBackButton,
  onBack, onClose, onEditField, onDeleteField,
  onToggleDisplay, onOpenFieldEditor,
}: {
  farm: Farm
  fields: PlacedField[]
  focusFieldId: string | null
  focusNonce: number
  onSelectField: (fieldId: string) => void
  showBackButton: boolean
  onBack: () => void
  onClose: () => void
  onEditField: (id: string) => void
  onDeleteField: (id: string) => void
  onToggleDisplay: (field: PlacedField) => void
  onOpenFieldEditor: () => void
  }) {
  
  const deleteField = useDeleteField(farm.id)
  const { removeFieldIdFromFarm } = useFarmStore()

  // Check-off straight from the drawer — same flow as the map's field
  // drawer: the card's check circle opens the standard check-off modal
  // (with the flexible harvest selector) and persists via the API.
  const completeOp = useCompleteRecommendedOp(farm.id)
  const [checking, setChecking] = useState<{
    field: PlacedField
    event: PlantingEvent
    op: RecommendedOperation
  } | null>(null)

  function handleDeleteField(fieldId: string) {
    deleteField.mutate(fieldId, {
      onSuccess: () => {
        removeFieldIdFromFarm(farm.id, fieldId)
        onDeleteField(fieldId) // notify parent if needed
        toast.success('Campo eliminado')
      },
    })
  }
  const totalOverdue = fields.reduce((sum, f) => {
    const h = getFieldOperationHealth(f.plantingEvents ?? [])
    return sum + h.overdue
  }, 0)
  const totalDueSoon = fields.reduce((sum, f) => {
    const h = getFieldOperationHealth(f.plantingEvents ?? [])
    return sum + h.dueSoon
  }, 0)

  

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {showBackButton && (
              <button onClick={onBack}
                className="text-[#9aab8a] hover:text-[#2d4a1e] transition-colors shrink-0"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#2d4a1e] truncate">{farm.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-[#9aab8a]">
                  {fields.length} {fields.length === 1 ? 'campo' : 'campos'}
                </p>
                {totalOverdue > 0 && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 rounded-full">
                    <AlertCircle size={8} className="text-red-500" />
                    <span className="text-[9px] text-red-600 font-bold">{totalOverdue} vencidas</span>
                  </div>
                )}
                {totalDueSoon > 0 && totalOverdue === 0 && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 rounded-full">
                    <Clock size={8} className="text-amber-500" />
                    <span className="text-[9px] text-amber-600 font-bold">{totalDueSoon} próximas</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[#9aab8a] hover:bg-[#e8f0e0] transition-colors shrink-0"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Scrollable field list */}
      <div className="flex-1 overflow-y-auto">
        {fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
            <Layers size={24} className="text-[#c0d8a0]" strokeWidth={1.5} />
            <p className="text-xs text-[#9aab8a]">
              No hay campos todavía. Usa el editor de campos para añadir.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#f0f5e8]">
            {fields.map(field => (
              <FieldCard
                key={field.id}
                field={field}
                focused={field.id === focusFieldId}
                focusNonce={focusNonce}
                onSelect={() => onSelectField(field.id)}
                onEdit={() => onEditField(field.id)}
                onDelete={() => handleDeleteField(field.id)}  // ← use this
                onToggleDisplay={() => onToggleDisplay(field)}
                onCheckOff={(op, event) => setChecking({ field, event, op })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Check-off modal — flexible harvest selection included */}
      {checking && (
        <CheckOffModal
          mode="complete"
          operation={checking.op}
          harvestTargets={harvestTargetsForOperation(
            checking.op,
            checking.field.plantingEvents ?? [],
            {
              rows: checking.field.rows ?? [],
              freePlants: checking.field.freePlants ?? [],
            }
          )}
          onConfirm={(data) => {
            completeOp.mutate(
              {
                fieldId: checking.field.id,
                eventId: checking.event.id,
                operationId: checking.op.id,
                data,
              },
              { onSuccess: () => toast.success('Operación registrada') }
            )
            setChecking(null)
          }}
          onCancel={() => setChecking(null)}
        />
      )}

      {/* Fixed bottom — Manage fields button */}
      <div className="px-4 py-3 border-t border-[#e0e8d8] bg-white shrink-0">
        <button
          onClick={onOpenFieldEditor}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
        >
          <Pencil size={13} /> Gestionar campos
        </button>
      </div>
    </div>
  )
}

// ── Individual field card ─────────────────────────────────────────────
function FieldCard({
  field, focused, focusNonce, onSelect, onEdit, onDelete, onToggleDisplay, onCheckOff,
}: {
  field: PlacedField
  focused: boolean
  focusNonce: number
  /** Clicking the card selects the field on the map. */
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleDisplay: () => void
  onCheckOff: (op: RecommendedOperation, event: PlantingEvent) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Scroll the clicked field's card into view (re-runs when the same field
  // is clicked again thanks to the nonce).
  useEffect(() => {
    if (focused) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, focusNonce])
  const summary = computeCropSummary(field.rows ?? [], field.freePlants ?? [], getCropById)
  const health = getFieldOperationHealth(field.plantingEvents ?? [])

  // Most urgent open calendar item — checkable right from the drawer
  const next = nextOperation(field)
  const nextCrop = next ? getCropById(next.event.cropTypeId) : null
  const nextIsDue = next?.op.status === 'due'
  const nextDate = next
    ? new Date(next.op.recommendedDate + 'T12:00:00')
        .toLocaleDateString('es-PR', { day: 'numeric', month: 'short' })
    : null

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={`px-4 py-3 hover:bg-[#fafcf8] transition-colors cursor-pointer ${
        focused ? 'bg-[#f5f8f0] border-l-2 border-l-[#639922]' : ''
      }`}
    >

      {/* Field name + color + operation badges */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: field.color }}
          />
          <span className="text-sm font-medium text-[#2d4a1e] truncate">{field.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {health.overdue > 0 && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 rounded-full">
              <AlertCircle size={8} className="text-red-500" />
              <span className="text-[9px] text-red-600 font-bold">{health.overdue}</span>
            </div>
          )}
          {health.dueSoon > 0 && (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 rounded-full">
              <Clock size={8} className="text-amber-500" />
              <span className="text-[9px] text-amber-600 font-bold">{health.dueSoon}</span>
            </div>
          )}
        </div>
      </div>

      {/* Area */}
      {field.boundary && field.boundary.length >= 3 && (() => {
        const bbox = farmBoundaryToBBox(field.boundary)
        const scale = getCanvasScale(bbox)
        const pts = field.boundary.map(p => latlngToCanvas(p.lat, p.lng, bbox))
        const acres = ft2ToAcres(areaFt2(pts, scale))
        return (
          <p className="text-[10px] text-[#9aab8a] mb-1.5">
            {acres.toFixed(3)} ac
          </p>
        )
      })()}

      {/* Crop summary */}
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {summary.map(c => (
            <div key={c.cropTypeId}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-[#f5f8f0] rounded"
            >
              <span className="text-xs">{c.emoji}</span>
              <span className="text-[10px] text-[#5a6a4a] font-medium">{c.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Current operation — check it off without leaving the drawer */}
      {next && (
        <div className={`flex items-center gap-2 mb-2.5 px-2 py-1.5 rounded-lg ${
          nextIsDue ? 'bg-red-50/70' : 'bg-[#f5f8f0]'
        }`}>
          <button
            onClick={() => onCheckOff(next.op, next.event)}
            aria-label={`Completar ${next.op.labelEs}`}
            title="Marcar como realizada"
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors hover:bg-[#eaf3de] ${
              nextIsDue
                ? 'border-red-400 hover:border-[#639922]'
                : 'border-[#c0d8a0] hover:border-[#639922]'
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-[#2d4a1e] truncate">
              {nextCrop?.emoji ?? '🌱'} {next.op.labelEs}
            </p>
            <p className={`text-[9px] ${nextIsDue ? 'text-red-500 font-medium' : 'text-[#9aab8a]'}`}>
              {nextIsDue ? 'Vencida — ' : ''}{nextDate}
              {nextCrop ? ` · ${nextCrop.nameEs}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Pin / shape toggle */}
      <button
        onClick={onToggleDisplay}
        className="flex items-center gap-1.5 mb-2.5 text-[10px] text-[#5a6a4a] hover:text-[#2d4a1e] transition-colors w-full"
      >
        {field.displayMode === 'pin' ? (
          <>
            <MapPin size={10} className="text-[#639922]" />
            <span>Mostrar como pin</span>
            <ToggleLeft size={13} className="text-[#c0d0b0] ml-auto" />
          </>
        ) : (
          <>
            <Layers size={10} className="text-[#639922]" />
            <span>Mostrar como forma</span>
            <ToggleRight size={13} className="text-[#639922] ml-auto" />
          </>
        )}
      </button>

      {/* Actions */}
      {!confirmDelete ? (
        <div className="flex items-center gap-2">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
          >
            <Pencil size={10} /> Editar
          </button>
          <button onClick={() => setConfirmDelete(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#9aab8a] border border-[#e0e8d8] rounded-lg hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={10} /> Eliminar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-red-500 text-center">
            ¿Eliminar "{field.name}"?
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onDelete}
              className="flex-1 py-1.5 text-[10px] text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              Sí, eliminar
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1.5 text-[10px] text-[#5a6a4a] border border-[#e0e8d8] rounded-lg hover:bg-[#f5f8f0] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}