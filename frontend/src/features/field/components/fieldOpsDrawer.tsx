import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Check, CheckCircle2, AlertCircle, Pencil } from 'lucide-react'
import { useFieldStore } from '@/store/useFieldStore'
import { useCompleteRecommendedOp } from '../hooks/useOperationsApi'
import { CheckOffModal, rowOptionsForOperation } from './operationsView'
import { getCropById } from '../data/cropLibrary'
import { toast } from '@/store/useToastStore'
import type { PlacedField, PlantingEvent, RecommendedOperation } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Field operations drawer — opens on a SINGLE click on a field in the map
// view. Shows one card per field of the active farm with its current
// operation (most urgent open item) and a check button that opens the
// standard check-off modal (with harvest row selection). Double-clicking a
// field on the map opens the full editor instead.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  farmId: string
  farmName: string
  /** The field that was clicked — its card is highlighted and scrolled to. */
  focusFieldId: string | null
  onClose: () => void
  /** "Editar campo" shortcut on a card → full field editor. */
  onOpenEditor: (fieldId: string) => void
}

// The most urgent open calendar item for a field: overdue first (oldest
// first), then upcoming (soonest first).
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

export default function FieldOpsDrawer({
  farmId, farmName, focusFieldId, onClose, onOpenEditor,
}: Props) {
  const fields = useFieldStore(s => s.fields)
  const farmFields = useMemo(
    () => fields.filter(f => f.farmId === farmId),
    [fields, farmId]
  )

  const completeOp = useCompleteRecommendedOp(farmId)

  // Check-off modal target — reuses the exact modal from the operations view
  const [checking, setChecking] = useState<{
    field: PlacedField
    event: PlantingEvent
    op: RecommendedOperation
  } | null>(null)

  return (
    <>
      <div className="absolute top-0 right-0 bottom-0 w-80 z-[1000] bg-white border-l border-[#e0e8d8] shadow-xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#2d4a1e]">Labores por campo</p>
            <p className="text-[10px] text-[#9aab8a] truncate">{farmName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9aab8a] hover:text-[#2d4a1e] hover:bg-[#eaf3de] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Field cards */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
          {farmFields.length === 0 ? (
            <p className="text-xs text-[#9aab8a] text-center py-8">
              Esta finca no tiene campos todavía.
            </p>
          ) : (
            farmFields.map(field => (
              <FieldOpsCard
                key={field.id}
                field={field}
                focused={field.id === focusFieldId}
                onCheck={(op, event) => setChecking({ field, event, op })}
                onOpenEditor={() => onOpenEditor(field.id)}
              />
            ))
          )}
          <p className="text-[10px] text-[#b0bea0] text-center pt-1">
            Doble clic en un campo del mapa abre el editor completo.
          </p>
        </div>
      </div>

      {/* Standard check-off modal — same UI as the operations view, with
          harvest row selection */}
      {checking && (
        <CheckOffModal
          mode="complete"
          operation={checking.op}
          rowOptions={rowOptionsForOperation(
            checking.op,
            checking.field.plantingEvents ?? [],
            checking.field.rows ?? []
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
    </>
  )
}

// ── One field card ────────────────────────────────────────────────────
function FieldOpsCard({ field, focused, onCheck, onOpenEditor }: {
  field: PlacedField
  focused: boolean
  onCheck: (op: RecommendedOperation, event: PlantingEvent) => void
  onOpenEditor: () => void
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const next = nextOperation(field)

  // Scroll the clicked field's card into view when the drawer opens/refocuses
  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focused])

  const openCount = (field.plantingEvents ?? [])
    .flatMap(e => e.operations)
    .filter(op => op.status === 'due' || op.status === 'pending')
    .length

  const totalPlants =
    field.rows.reduce((s, r) => s + r.plants.length, 0) + field.freePlants.length

  const crop = next ? getCropById(next.event.cropTypeId) : null
  const isDue = next?.op.status === 'due'
  const dateFormatted = next
    ? new Date(next.op.recommendedDate + 'T12:00:00')
        .toLocaleDateString('es-PR', { day: 'numeric', month: 'short' })
    : null

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border overflow-hidden transition-colors ${
        focused ? 'border-[#639922] ring-1 ring-[#639922]' : 'border-[#e0e8d8]'
      }`}
    >
      {/* Field header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[#fafcf8]">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: field.color }}
          aria-hidden
        />
        <p className="flex-1 text-xs font-semibold text-[#2d4a1e] truncate">
          {field.name}
        </p>
        {openCount > 1 && (
          <span className="text-[10px] text-[#9aab8a]">{openCount} pendientes</span>
        )}
        <button
          onClick={onOpenEditor}
          aria-label={`Editar ${field.name}`}
          title="Abrir editor de campo"
          className="w-6 h-6 flex items-center justify-center rounded-lg text-[#c0d0b0] hover:text-[#2d4a1e] hover:bg-[#f0f5e8] transition-colors shrink-0"
        >
          <Pencil size={11} />
        </button>
      </div>

      {/* Current operation */}
      {next ? (
        <div className={`flex items-center gap-2.5 px-3 py-2.5 ${isDue ? 'bg-red-50/50' : ''}`}>
          {/* Check button — opens the check-off modal */}
          <button
            onClick={() => onCheck(next.op, next.event)}
            aria-label={`Completar ${next.op.labelEs}`}
            title="Marcar como realizada"
            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors hover:bg-[#eaf3de] group ${
              isDue ? 'border-red-400 hover:border-[#639922]' : 'border-[#c0d8a0] hover:border-[#639922]'
            }`}
          >
            <Check size={13} className="text-transparent group-hover:text-[#639922] transition-colors" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[#2d4a1e] truncate">
              {crop?.emoji ?? '🌱'} {next.op.labelEs}
            </p>
            <p className={`text-[10px] ${isDue ? 'text-red-500 font-medium' : 'text-[#9aab8a]'}`}>
              {isDue && <AlertCircle size={9} className="inline mr-0.5 -mt-px" />}
              {isDue ? 'Vencida — ' : ''}{dateFormatted}
              {crop ? ` · ${crop.nameEs}` : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <CheckCircle2 size={14} className="text-[#8fba4e] shrink-0" />
          <p className="text-[11px] text-[#9aab8a]">
            {(field.plantingEvents ?? []).length === 0
              ? 'Sin cultivos — añade hileras en el editor'
              : 'Al día — sin labores pendientes'}
          </p>
        </div>
      )}

      {/* Field detail — rows and plants (the selected field also draws its
          plants on the map) */}
      {(field.rows.length > 0 || field.freePlants.length > 0) && (
        <div className="px-3 py-2 border-t border-[#f0f5e8] flex flex-col gap-1">
          <p className="text-[10px] font-medium text-[#7a8a6a]">
            {field.rows.length} {field.rows.length === 1 ? 'hilera' : 'hileras'}
            {' · '}{totalPlants.toLocaleString()} plantas
          </p>
          {field.rows.slice(0, 6).map((row, i) => {
            const rowCrop = getCropById(row.primaryCropTypeId)
            const companion = row.companionCropTypeId
              ? getCropById(row.companionCropTypeId)
              : null
            return (
              <p key={row.id} className="text-[10px] text-[#9aab8a] truncate">
                Hilera {i + 1} · {rowCrop?.emoji ?? '🌱'} {rowCrop?.nameEs ?? row.primaryCropTypeId}
                {companion ? ` + ${companion.emoji} ${companion.nameEs}` : ''}
                {' · '}{row.plants.length} plantas
              </p>
            )
          })}
          {field.rows.length > 6 && (
            <p className="text-[10px] text-[#b0bea0]">
              +{field.rows.length - 6} hileras más
            </p>
          )}
          {field.freePlants.length > 0 && (
            <p className="text-[10px] text-[#9aab8a]">
              🌱 {field.freePlants.length} plantas sueltas
            </p>
          )}
        </div>
      )}
    </div>
  )
}
