import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ClipboardList, AlertCircle, Clock, Download, Loader2,
  Pencil, Trash2, Check,
} from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { useLivestockStore } from '@/store/useLivestockStore'
import { CollapseToggle, DateRangeSelect, filterSelectClass, Pager } from '@/components/shared/logFilters'
import { minDateFor, type DateRange } from '@/lib/dateRange'
import { useCollapsed } from '@/hooks/useCollapsed'
import { useConfirm } from '@/components/shared/confirmDialog'
import { toast } from '@/store/useToastStore'
import { dateLocale, fmtNumber } from '@/i18n'
import {
  useOperationsLedger, useDueSoonSummary, useExportOperations,
  useUpdateOperation, useDeleteOperation,
  type FarmOperation,
} from '../hooks/useOperationsApi'

// ──────────────────────────────────────────────────────────────────────────
// Operations log — Dashboard section backed by the server API:
//   GET /farms/:farmId/operations                    → the log entries
//   GET /farms/:farmId/recommended-operations/due-soon → overdue/due badges
//   GET /farms/:farmId/operations/export             → CSV download
// Unlike the "Labores" panel (derived client-side from the loaded fields),
// this shows what was actually LOGGED, straight from the database — the
// SDD §6.2 check-off flow lands its entries here.
// ──────────────────────────────────────────────────────────────────────────

// i18n label keys (`opType.*` in the field namespace) + emojis for every
// operation type the API accepts (union of SDD §3.2.8 and the
// crop-schedule types).
const TYPE_META: Record<string, { labelKey: string; emoji: string }> = {
  planting: { labelKey: 'opType.planting', emoji: '🌱' },
  spraying: { labelKey: 'opType.spray', emoji: '💧' },
  spray: { labelKey: 'opType.spray', emoji: '💧' },
  fertilization: { labelKey: 'opType.fertilization', emoji: '🌿' },
  cultivation: { labelKey: 'opType.cultivation', emoji: '⛏️' },
  irrigation: { labelKey: 'opType.irrigation', emoji: '🚿' },
  flowering: { labelKey: 'opType.flowering', emoji: '🌸' },
  monitoring: { labelKey: 'opType.monitoring', emoji: '👁️' },
  harvest: { labelKey: 'opType.harvest', emoji: '🧺' },
  feeding: { labelKey: 'opType.feeding', emoji: '🥕' },
  health_treatment: { labelKey: 'opType.health_treatment', emoji: '💊' },
  breeding: { labelKey: 'opType.breeding', emoji: '🐣' },
  production_record: { labelKey: 'opType.production_record', emoji: '📊' },
  other: { labelKey: 'opType.other', emoji: '📋' },
}

const PAGE_SIZE = 8 // rows per page

export default function OperationsLogSection() {
  const { t } = useTranslation('field')
  const activeFarm = useFarmStore(s => s.activeFarm)
  const farms = useFarmStore(s => s.farms)

  // Farm scope — "Todas las fincas" by default, like the Siembras grid.
  const [farmFilter, setFarmFilter] = useState('all')
  const farmIds = useMemo(
    () => (farmFilter === 'all' ? farms.map(f => f.id) : [farmFilter]),
    [farmFilter, farms]
  )

  const { data: operations, isLoading } = useOperationsLedger(farmIds)
  const { data: dueSoon } = useDueSoonSummary(farmIds)
  // The export endpoint is per farm: the selected farm when one is
  // filtered, the active farm otherwise.
  const exportFarmId = farmFilter !== 'all' ? farmFilter : activeFarm?.id ?? null
  const exportCsv = useExportOperations(exportFarmId ?? '')

  // Every entry is correctable: edits/deletes propagate server-side to the
  // linked recommendation and harvest yield, so fixing "300 lb" to "30 lb"
  // here fixes it everywhere. farmId travels per row (multi-farm view).
  const updateOp = useUpdateOperation()
  const deleteOp = useDeleteOperation()
  const { confirm, confirmDialog } = useConfirm()
  const [editing, setEditing] = useState<FarmOperation | null>(null)
  // Collapsible body — the header (count + export) always stays visible.
  const [collapsed, toggleCollapsed] = useCollapsed('mi-finca-collapse-labores-log')

  // Resolve fieldId / livestockUnitId to display names from the stores.
  const getField = useFieldStore(s => s.getField)
  const allFields = useFieldStore(s => s.fields)
  const livestockUnits = useLivestockStore(s => s.units)
  const unitName = (id: string | null) =>
    id ? livestockUnits.find(u => u.id === id)?.name ?? null : null

  // ── Filters — field, labor type, date range; applied BEFORE paging so
  //    a filtered view never silently hides matches. Every filter change
  //    returns to page 1 in its own handler. ────────────────────────────
  const [fieldFilter, setFieldFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [page, setPage] = useState(1)

  function changeFarmFilter(v: string) {
    setFarmFilter(v)
    setFieldFilter('all')
    setTypeFilter('all')
    setPage(1)
  }
  function changeFieldFilter(v: string) { setFieldFilter(v); setPage(1) }
  function changeTypeFilter(v: string) { setTypeFilter(v); setPage(1) }
  function changeDateRange(v: DateRange) { setDateRange(v); setPage(1) }

  const scopedFields = useMemo(
    () => (farmFilter === 'all' ? allFields : allFields.filter(f => f.farmId === farmFilter)),
    [allFields, farmFilter]
  )
  const presentTypes = useMemo(
    () => [...new Set((operations ?? []).map(o => o.type))],
    [operations]
  )
  const filtered = useMemo(() => {
    const minDate = minDateFor(dateRange)
    return (operations ?? []).filter(op =>
      (fieldFilter === 'all' || op.fieldId === fieldFilter) &&
      (typeFilter === 'all' || op.type === typeFilter) &&
      (minDate === null || op.actualDate >= minDate)
    )
  }, [operations, fieldFilter, typeFilter, dateRange])

  if (farms.length === 0) return null

  async function handleDelete(op: FarmOperation) {
    const meta = TYPE_META[op.type] ?? TYPE_META.other
    const ok = await confirm({
      title: t('log.confirmDeleteTitle', { type: t(meta.labelKey).toLowerCase() }),
      message: op.recommendedOperationId
        ? t('log.confirmDeleteLinked')
        : t('log.confirmDeletePlain'),
      confirmLabel: t('actions.delete'),
      danger: true,
    })
    if (!ok) return
    deleteOp.mutate({ farmId: op.farmId, id: op.id }, {
      onSuccess: () => toast.success(t('toast.entryDeleted')),
    })
  }

  // Paged view — clamp so a shrinking filter never strands the user on a
  // page past the end.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const recent = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const total = operations?.length ?? 0
  const selectedFarm = farms.find(f => f.id === farmFilter)

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">

      {/* Header — count + CSV export; always visible, body collapses */}
      <div className={`flex items-center gap-2 px-5 py-4 ${collapsed ? '' : 'border-b border-[#e0e8d8]'}`}>
        <ClipboardList size={16} className="text-[#4d7a1b]" />
        <h2 className="text-sm font-semibold text-[#2d4a1e]">{t('log.title')}</h2>
        {total > 0 && (
          <span className="text-xs text-[#66755a]">
            {t('count.logged', { count: total })}
            {selectedFarm ? ` · ${selectedFarm.name}` : ''}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => exportCsv.mutate()}
          disabled={total === 0 || !exportFarmId || exportCsv.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#2d4a1e] border border-[#d0dcc0] rounded-lg hover:bg-[#f0f5e8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={total === 0 ? t('log.nothingToExport') : t('log.downloadCsv')}
        >
          {exportCsv.isPending
            ? <Loader2 size={12} className="animate-spin" />
            : <Download size={12} />}
          {t('log.exportCsv')}
        </button>
        <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {!collapsed && (<>
      {/* Filters — farm (when there are several), field, type, dates */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-[#f0f5e8]">
          {farms.length > 1 && (
            <select
              aria-label={t('log.farmFilter')}
              value={farmFilter}
              onChange={e => changeFarmFilter(e.target.value)}
              className={filterSelectClass}
            >
              <option value="all">{t('log.allFarms')}</option>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <select
            aria-label={t('log.allFields')}
            value={fieldFilter}
            onChange={e => changeFieldFilter(e.target.value)}
            className={filterSelectClass}
          >
            <option value="all">{t('log.allFields')}</option>
            {scopedFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select
            aria-label={t('log.allTypes')}
            value={typeFilter}
            onChange={e => changeTypeFilter(e.target.value)}
            className={filterSelectClass}
          >
            <option value="all">{t('log.allTypes')}</option>
            {presentTypes.map(type => {
              const meta = TYPE_META[type] ?? TYPE_META.other
              return <option key={type} value={type}>{meta.emoji} {t(meta.labelKey)}</option>
            })}
          </select>
          <DateRangeSelect value={dateRange} onChange={changeDateRange} />
          <span className="ml-auto text-[11px] text-[#66755a]">
            {t('log.shownCount', { shown: recent.length, count: filtered.length })}
          </span>
        </div>
      )}

      {/* Server-verified calendar badges (includes livestock recommendations,
          which the client-side "Labores" numbers don't cover) */}
      {dueSoon && (dueSoon.overdueCount > 0 || dueSoon.dueSoonCount > 0) && (
        <div className="flex gap-2 px-5 py-3 border-b border-[#f0f5e8]">
          {dueSoon.overdueCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 rounded-full">
              <AlertCircle size={12} className="text-red-600" />
              <span className="text-[11px] font-semibold text-red-600">
                {t('count.overdue', { count: dueSoon.overdueCount })}
              </span>
            </div>
          )}
          {dueSoon.dueSoonCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-full">
              <Clock size={12} className="text-amber-500" />
              <span className="text-[11px] font-semibold text-amber-600">
                {t('count.dueSoon14', { count: dueSoon.dueSoonCount })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Log entries */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-8">
          <Loader2 size={14} className="animate-spin text-[#66755a]" />
          <span className="text-xs text-[#66755a]">{t('log.loading')}</span>
        </div>
      ) : recent.length === 0 ? (
        <p className="px-5 py-6 text-xs text-[#66755a] text-center">
          {total === 0 ? t('log.empty') : t('log.noMatch')}
        </p>
      ) : (
        <>
          <div className="divide-y divide-[#f0f5e8]">
            {recent.map(op => (
              <OperationLogRow
                key={op.id}
                op={op}
                fieldName={op.fieldId ? getField(op.fieldId)?.name ?? null : null}
                livestockName={unitName(op.livestockUnitId)}
                farmName={farmFilter === 'all' && farms.length > 1
                  ? farms.find(f => f.id === op.farmId)?.name ?? null
                  : null}
                onEdit={() => setEditing(op)}
                onDelete={() => handleDelete(op)}
              />
            ))}
          </div>
          <Pager page={currentPage} pageCount={pageCount} onPage={setPage} />
        </>
      )}
      </>)}

      {/* Edit modal */}
      {editing && (
        <EditOperationModal
          op={editing}
          onCancel={() => setEditing(null)}
          onSave={(updates) => {
            updateOp.mutate(
              { farmId: editing.farmId, id: editing.id, updates },
              { onSuccess: () => toast.success(t('toast.entryUpdated')) }
            )
            setEditing(null)
          }}
        />
      )}

      {confirmDialog}
    </section>
  )
}

// ── Single log entry row ──────────────────────────────────────────────
function OperationLogRow({ op, fieldName, livestockName, farmName, onEdit, onDelete }: {
  op: FarmOperation
  fieldName: string | null
  livestockName: string | null
  /** Shown in the all-farms view to disambiguate same-named fields. */
  farmName: string | null
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('field')
  const meta = TYPE_META[op.type] ?? TYPE_META.other

  // Context line: where + who + what was used,
  // e.g. "Finca Verde · Campo Norte · por Luis · 25 kg · Nitrato…"
  const details = [
    farmName,
    fieldName,
    livestockName,
    op.performedBy?.fullName ? t('log.performedBy', { name: op.performedBy.fullName }) : null,
    op.quantity ? `${fmtNumber(op.quantity)} ${op.unit ?? ''}`.trim() : null,
    op.product,
    op.notes,
  ].filter(Boolean).join(' · ')

  const dateFormatted = new Date(op.actualDate + 'T12:00:00')
    .toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="group flex items-center gap-3 px-5 py-2.5">
      <span className="text-lg" aria-hidden>{meta.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#2d4a1e] truncate">{t(meta.labelKey)}</p>
        {details && (
          <p className="text-[10px] text-[#66755a] truncate">{details}</p>
        )}
      </div>
      <span className="text-[10px] font-semibold text-[#5a6a4a] shrink-0">
        {dateFormatted}
      </span>
      {/* Corrections: edit fixes values in place; delete removes the entry
          (and reopens the calendar item it completed, if any) */}
      <button
        onClick={onEdit}
        aria-label={t('log.editEntry')}
        className="w-6 h-6 pointer-coarse:w-10 pointer-coarse:h-10 flex items-center justify-center rounded-lg text-[#66755a] hover:text-[#2d4a1e] hover:bg-[#f0f5e8] transition-colors shrink-0"
      >
        <Pencil size={12} />
      </button>
      <button
        onClick={onDelete}
        aria-label={t('log.deleteEntry')}
        className="w-6 h-6 pointer-coarse:w-10 pointer-coarse:h-10 flex items-center justify-center rounded-lg text-[#66755a] hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── Edit modal — corrects a log entry's date/quantity/product/notes ───
function EditOperationModal({ op, onSave, onCancel }: {
  op: FarmOperation
  onSave: (updates: {
    actualDate?: string
    product?: string | null
    quantity?: number | null
    unit?: string | null
    notes?: string | null
  }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('field')
  const meta = TYPE_META[op.type] ?? TYPE_META.other
  const today = new Date().toISOString().split('T')[0]

  const [actualDate, setActualDate] = useState(op.actualDate)
  const [product, setProduct] = useState(op.product ?? '')
  const [quantity, setQuantity] = useState(op.quantity != null ? String(op.quantity) : '')
  const [unit, setUnit] = useState(op.unit ?? 'lb')
  const [notes, setNotes] = useState(op.notes ?? '')

  const units = op.type === 'harvest'
    ? ['kg', 'lb', 'unidades', 'cajas', 'sacos']
    : ['kg', 'lb', 'L', 'gal', 'oz']

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] transition-colors'

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">

          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0]">
            <p className="text-sm font-semibold text-[#2d4a1e]">{t('log.editModalTitle')}</p>
            <p className="text-xs text-[#5a6a4a] mt-0.5">{meta.emoji} {t(meta.labelKey)}</p>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">{t('form.date')}</label>
              <input
                type="date" value={actualDate} max={today}
                onChange={e => setActualDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                {t('form.quantity')} <span className="text-[#66755a] font-normal">{t('form.optional')}</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number" min={0} value={quantity} placeholder="0"
                  onChange={e => setQuantity(e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <select
                  value={unit} onChange={e => setUnit(e.target.value)}
                  className="px-2 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] bg-white focus:outline-none focus:border-[#639922]"
                >
                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                {t('form.product')} <span className="text-[#66755a] font-normal">{t('form.optional')}</span>
              </label>
              <input
                type="text" value={product} placeholder={t('form.productPlaceholder')}
                onChange={e => setProduct(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                {t('form.notes')} <span className="text-[#66755a] font-normal">{t('form.optional')}</span>
              </label>
              <textarea
                value={notes} rows={2} placeholder={t('form.notesPlaceholderShort')}
                onChange={e => setNotes(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-[#e0e8d8] flex gap-2">
            <button onClick={onCancel}
              className="flex-1 py-2 text-sm text-[#5a6a4a] hover:bg-[#f0f5e8] rounded-lg transition-colors"
            >
              {t('actions.cancel')}
            </button>
            <button
              onClick={() => onSave({
                actualDate,
                product: product || null,
                quantity: quantity ? Number(quantity) : null,
                unit: quantity ? unit : null,
                notes: notes || null,
              })}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-sm font-medium hover:bg-[#3d6128] transition-colors"
            >
              <Check size={14} />
              {t('actions.save')}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
