import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight, ChevronLeft, Star, Plus,
  MapPin, Layers, Trash2, Users,
  AlertCircle, Clock,
} from 'lucide-react'
import { useDeleteField } from '@/features/field/hooks/useFieldsApi'
import { useDeleteFarm } from '../hooks/useFarmsApi'
import { useIsPhone } from '@/hooks/useViewport'
import TeamModal from './teamModal'
import JoinFarmModal from './joinFarmModal'
import { useFarmStore, canManageStructure, isFarmOwner } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { getFieldOperationHealth } from '@/features/field/utils/operationStatus'
import FieldSummaryCard from '@/features/field/components/fieldSummaryCard'
import CorralCard from '@/features/livestock/components/corralCard'
import type { Farm } from '@/store/useFarmStore'
import type { PlacedField } from '@/features/field/types'
import { toast } from '@/store/useToastStore'
import { fmtNumber } from '@/i18n'

type Props = {
  /** Open state lives in the host so it survives the drawer unmounting
      while the on-map field editor is active. */
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onAddFarm: () => void
  /** Open the field editor editing this specific field. */
  onEditField: (fieldId: string) => void
  onDeleteField: (fieldId: string) => void
  /** Switch to + fly to this farm. The host owns the unsaved-work guard
      and returns false when the user declines the switch. */
  onFlyToFarm: (farm: Farm) => boolean | void
  onOpenFieldEditor: (farmId: string) => void
  /** Set on a map field click: opens the drawer focused on that field.
      The nonce lets the same field re-trigger after the drawer closes. */
  focusRequest?: { fieldId: string; nonce: number } | null
  /** Card click → select that field on the map (two-way selection). */
  onSelectField: (fieldId: string) => void
  /** Card double-click → zoom the map to that field (no editor). */
  onZoomToField: (fieldId: string) => void
}

export default function FarmDrawer({
  isOpen, onOpenChange, onAddFarm, onEditField, onDeleteField,
  onFlyToFarm, onOpenFieldEditor, focusRequest, onSelectField, onZoomToField,
}: Props) {
  const { t } = useTranslation('farm')
  const [level, setLevel] = useState<'farms' | 'fields'>('farms')
  // "Equipo" roster/management modal — per farm
  const [teamFarm, setTeamFarm] = useState<Farm | null>(null)
  // "Unirme a una finca" — redeem a join code
  const [showJoin, setShowJoin] = useState(false)
  // On a phone the drawer takes the full map width, so the side toggle tab
  // would land off-screen while open — hide it and close via the header.
  const isPhone = useIsPhone()

  // A field was clicked on the map — open the drawer at the fields level;
  // the matching card highlights and scrolls into view.
  useEffect(() => {
    if (!focusRequest) return
    onOpenChange(true)
    setLevel('fields')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce])

  const {
    farms, activeFarm, activeFarmId, favoriteFarmId,
    setActiveFarm, setFavoriteFarm,
  } = useFarmStore()
  const deleteFarmApi = useDeleteFarm()
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
    // The host activates the farm (after its unsaved-work guard) — a
    // false return means the user chose to stay put.
    if (onFlyToFarm(farm) === false) return
    setLevel('fields')
  }

  function handleBackToFarms() {
    setLevel('farms')
  }

  // Delete on the server first — the mutation's onSuccess removes the
  // farm from the store. A store-only delete came back on every refetch.
  async function handleDeleteFarm(farm: Farm) {
    if (!window.confirm(t('confirmDeleteFarm', { name: farm.name }))) return
    try {
      await deleteFarmApi.mutateAsync(farm.id)
      removeFieldsByFarmId(farm.id)
      if (farms.length <= 1) setLevel('farms')
    } catch (err) {
      console.error('Failed to delete farm:', err)
      // toast.error already fired by api.ts handleResponse
    }
  }

  const fields = activeFarm ? getFieldsByFarmId(activeFarm.id) : []

  // Total overdue across all fields of active farm
  const totalOverdue = fields.reduce((sum, f) => {
    const health = getFieldOperationHealth(f.plantingEvents ?? [])
    return sum + health.overdue
  }, 0)

  return (
    <>
      {/* ── Drawer toggle tab (hidden while a full-width drawer is open) ── */}
      {!(isPhone && isOpen) && (
      <button
        onClick={() => onOpenChange(!isOpen)}
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
          {level === 'fields' && activeFarm ? activeFarm.name : t('drawer.farmsTab')}
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
      )}

      {/* ── Drawer panel ─────────────────────────────────────────── */}
      <div
        className="absolute left-0 top-0 h-full z-[1000] bg-white border-r border-[#e0e8d8] shadow-xl flex flex-col overflow-hidden"
        style={{
          width: isPhone ? '100%' : 300,
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
              onTeam={setTeamFarm}
              onJoin={() => setShowJoin(true)}
              onAddFarm={onAddFarm}
              onClose={() => onOpenChange(false)}
            />
          : activeFarm
          ? <FieldList
              farm={activeFarm}
              fields={fields}
              focusFieldId={focusRequest?.fieldId ?? null}
              focusNonce={focusRequest?.nonce ?? 0}
              onSelectField={onSelectField}
              onZoomToField={onZoomToField}
              showBackButton
              onBack={handleBackToFarms}
              onTeam={() => setTeamFarm(activeFarm)}
              onClose={() => onOpenChange(false)}
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

      {/* Equipo — roster + membership management (portaled) */}
      {teamFarm && (
        <TeamModal farm={teamFarm} onClose={() => setTeamFarm(null)} />
      )}
      {showJoin && <JoinFarmModal onClose={() => setShowJoin(false)} />}
    </>
  )
}

// ── Level 1: Farm list ────────────────────────────────────────────────
function FarmList({
  farms, favoriteFarmId, onSelect, onSetFavorite,
  onDelete, onTeam, onJoin, onAddFarm, onClose,
}: {
  farms: Farm[]
  favoriteFarmId: string | null
  onSelect: (farm: Farm) => void
  onSetFavorite: (id: string) => void
  onDelete: (farm: Farm) => void
  onTeam: (farm: Farm) => void
  onJoin: () => void
  onAddFarm: () => void
  onClose: () => void
}) {
  const { t } = useTranslation('farm')
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
            {t('drawer.myFarms')}
          </p>
          <p className="text-[10px] text-[#9aab8a] mt-0.5">
            {t('drawer.farmCount', { count: farms.length })}
          </p>
        </div>
        <button onClick={onClose}
          className="w-6 h-6 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded-md text-[#9aab8a] hover:bg-[#e8f0e0] transition-colors"
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
              {t('drawer.noFarmsYet')}
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
                            {t('drawer.fieldCount', { count: farmFields.length })}
                          </span>
                          {farm.boundary?.length > 0 && (
                            <span className="text-[10px] text-[#7a8a6a]">
                              {farm.totalAreaAcres > 0 ? t('acresShort', { value: fmtNumber(farm.totalAreaAcres) }) : ''}
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

                  {/* Farm actions — on hover; always shown on touch, where
                      hover doesn't exist */}
                  <div className="hidden group-hover:flex pointer-coarse:flex items-center gap-1 px-4 pb-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSetFavorite(farm.id) }}
                      className={`flex items-center gap-1 px-2 py-1 pointer-coarse:px-3 pointer-coarse:py-2 rounded text-[10px] transition-colors ${
                        isFavorite
                          ? 'text-amber-500 bg-amber-50'
                          : 'text-[#9aab8a] hover:text-amber-500 hover:bg-amber-50'
                      }`}
                      title={isFavorite ? t('drawer.favoriteTitle') : t('drawer.markFavoriteTitle')}
                    >
                      <Star size={10} className={isFavorite ? 'fill-amber-400' : ''} />
                      {t('drawer.favorite')}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onTeam(farm) }}
                      className="flex items-center gap-1 px-2 py-1 pointer-coarse:px-3 pointer-coarse:py-2 rounded text-[10px] text-[#9aab8a] hover:text-[#2d4a1e] hover:bg-[#f0f5e8] transition-colors"
                      title={t('drawer.teamTitle')}
                    >
                      <Users size={10} /> {t('drawer.team')}
                    </button>
                    {/* Deleting a farm is owner-only — hide what the server rejects */}
                    {isFarmOwner(farm) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(farm) }}
                      className="flex items-center gap-1 px-2 py-1 pointer-coarse:px-3 pointer-coarse:py-2 rounded text-[10px] text-[#9aab8a] hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={10} /> {t('drawer.delete')}
                    </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Fixed bottom — Add farm + join-by-code */}
      <div className="px-4 py-3 border-t border-[#e0e8d8] bg-white shrink-0 flex flex-col gap-1.5">
        <button
          onClick={onAddFarm}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
        >
          <Plus size={13} /> {t('drawer.addFarm')}
        </button>
        <button
          onClick={onJoin}
          className="w-full py-1.5 pointer-coarse:py-2.5 text-[10px] text-[#7a8a6a] hover:text-[#2d4a1e] transition-colors"
        >
          {t('drawer.joinPrompt')}
        </button>
      </div>
    </div>
  )
}

// ── Level 2: Field list for a farm ────────────────────────────────────
// Cards are the shared FieldSummaryCard (same one the field editor uses):
// single click selects on the map, double click zooms the map to the
// field, Editar opens the editor for that field, and the card owns
// check-off + the full operations UI.
function FieldList({
  farm, fields, focusFieldId, focusNonce, onSelectField, onZoomToField,
  showBackButton, onBack, onTeam, onClose, onEditField, onDeleteField,
  onToggleDisplay, onOpenFieldEditor,
}: {
  farm: Farm
  fields: PlacedField[]
  focusFieldId: string | null
  focusNonce: number
  onSelectField: (fieldId: string) => void
  onZoomToField: (fieldId: string) => void
  showBackButton: boolean
  onBack: () => void
  onTeam: () => void
  onClose: () => void
  onEditField: (id: string) => void
  onDeleteField: (id: string) => void
  onToggleDisplay: (field: PlacedField) => void
  onOpenFieldEditor: () => void
  }) {

  const { t } = useTranslation('farm')
  const deleteField = useDeleteField(farm.id)
  const { removeFieldIdFromFarm } = useFarmStore()

  function handleDeleteField(fieldId: string) {
    deleteField.mutate(fieldId, {
      onSuccess: () => {
        removeFieldIdFromFarm(farm.id, fieldId)
        onDeleteField(fieldId) // notify parent if needed
        toast.success(t('drawer.fieldDeleted'))
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
                className="pointer-coarse:p-2.5 text-[#9aab8a] hover:text-[#2d4a1e] transition-colors shrink-0"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#2d4a1e] truncate">{farm.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-[#9aab8a]">
                  {t('drawer.fieldCount', { count: fields.length })}
                </p>
                {totalOverdue > 0 && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 rounded-full">
                    <AlertCircle size={8} className="text-red-500" />
                    <span className="text-[9px] text-red-600 font-bold">{t('drawer.overdueBadge', { count: totalOverdue })}</span>
                  </div>
                )}
                {totalDueSoon > 0 && totalOverdue === 0 && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 rounded-full">
                    <Clock size={8} className="text-amber-500" />
                    <span className="text-[9px] text-amber-600 font-bold">{t('drawer.dueSoonBadge', { count: totalDueSoon })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onTeam}
              title={t('drawer.teamTitle')}
              className="w-6 h-6 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded-md text-[#9aab8a] hover:bg-[#e8f0e0] transition-colors"
            >
              <Users size={13} />
            </button>
            <button onClick={onClose}
              className="w-6 h-6 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded-md text-[#9aab8a] hover:bg-[#e8f0e0] transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable field list */}
      <div className="flex-1 overflow-y-auto">
        {fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
            <Layers size={24} className="text-[#c0d8a0]" strokeWidth={1.5} />
            <p className="text-xs text-[#9aab8a]">
              {t('drawer.noFieldsYet')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#f0f5e8]">
            {fields.map(field => (
              // Livestock fields (corrales) get the compact herd card — no
              // crop rows or operations calendar apply to them.
              field.kind === 'livestock' ? (
                <CorralCard
                  key={field.id}
                  field={field}
                  focused={field.id === focusFieldId}
                  focusNonce={focusNonce}
                  onSelect={() => onSelectField(field.id)}
                  onZoomToField={() => onZoomToField(field.id)}
                  onOpenEditor={() => onEditField(field.id)}
                  onDelete={() => handleDeleteField(field.id)}
                />
              ) : (
                <FieldSummaryCard
                  key={field.id}
                  field={field}
                  focused={field.id === focusFieldId}
                  focusNonce={focusNonce}
                  onSelect={() => onSelectField(field.id)}
                  onOpenEditor={() => onEditField(field.id)}
                  onCardDoubleClick={() => onZoomToField(field.id)}
                  onDelete={() => handleDeleteField(field.id)}
                  onToggleDisplay={() => onToggleDisplay(field)}
                />
              )
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom — start drawing a new field on the map.
          Field structure is admin+ work; operators don't get the button. */}
      {canManageStructure(farm) && (
      <div className="px-4 py-3 border-t border-[#e0e8d8] bg-white shrink-0">
        <button
          onClick={onOpenFieldEditor}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors"
        >
          <Plus size={13} /> {t('drawer.newField')}
        </button>
      </div>
      )}
    </div>
  )
}
