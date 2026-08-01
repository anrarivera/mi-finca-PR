import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Package, Sprout, AlertCircle, Clock, CheckCircle2, ClipboardList,
  ChevronDown, ChevronRight, ArrowUpDown, Wheat, Rows3, TreeDeciduous,
  CalendarDays, Bug, PawPrint,
} from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { getCropById } from '@/features/field/data/cropLibrary'
import {
  buildInventoryRows, summarizeInventory,
  type InventoryRow, type InventoryStatus,
} from '@/features/inventory/inventoryBuilder'
import { dateLocale, localName, localOpLabel, formatRelativeDays } from '@/i18n'
import OperationsLogSection from '@/features/field/components/operationsLogSection'
import OperationsCalendar from '@/features/field/components/operationsCalendar'
import HarvestLogSection from '@/features/field/components/harvestLogSection'
import SanidadRecordsSection from '@/features/scouting/components/sanidadRecordsSection'
import LivestockSection from '@/features/livestock/components/livestockSection'

// ──────────────────────────────────────────────────────────────────────────
// Cuaderno de campo — the farm's books: what you have and what has
// happened, in tabs. Siembras (the inventory data grid, issue #15) ·
// Labores (operations log + month calendar) · Cosechas · Sanidad (the
// records half of the sanitary report) · Animales. The forward-looking
// "what's due today" view lives on the Panel de control.
// ──────────────────────────────────────────────────────────────────────────

type CuadernoTab = 'siembras' | 'labores' | 'cosechas' | 'sanidad' | 'animales'

// labelKey resolves in the 'pages' namespace (inventory.tabs.*).
const TABS: Array<{ id: CuadernoTab; labelKey: string; icon: React.ReactNode }> = [
  { id: 'siembras', labelKey: 'inventory.tabs.siembras', icon: <Package size={13} /> },
  { id: 'labores', labelKey: 'inventory.tabs.labores', icon: <CalendarDays size={13} /> },
  { id: 'cosechas', labelKey: 'inventory.tabs.cosechas', icon: <Wheat size={13} /> },
  { id: 'sanidad', labelKey: 'inventory.tabs.sanidad', icon: <Bug size={13} /> },
  { id: 'animales', labelKey: 'inventory.tabs.animales', icon: <PawPrint size={13} /> },
]

type SortKey = 'crop' | 'field' | 'plants' | 'planted' | 'nextOp' | 'harvest'
type SortDir = 'asc' | 'desc'

const STATUS_META: Record<InventoryStatus, { labelKey: string; classes: string }> = {
  overdue: { labelKey: 'inventory.status.overdue', classes: 'bg-red-50 text-red-600' },
  dueSoon: { labelKey: 'inventory.status.dueSoon', classes: 'bg-amber-50 text-amber-600' },
  ok: { labelKey: 'inventory.status.ok', classes: 'bg-[#eaf3de] text-[#639922]' },
  done: { labelKey: 'inventory.status.done', classes: 'bg-gray-100 text-gray-500' },
}

const SOURCE_META = {
  rows: { labelKey: 'inventory.source.rows', icon: <Rows3 size={11} /> },
  plants: { labelKey: 'inventory.source.plants', icon: <TreeDeciduous size={11} /> },
  mixed: { labelKey: 'inventory.source.mixed', icon: <Sprout size={11} /> },
} as const

function formatDateEs(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function InventoryPage() {
  const { t } = useTranslation('pages')
  const farms = useFarmStore(s => s.farms)
  const fields = useFieldStore(s => s.fields)

  const [tab, setTab] = useState<CuadernoTab>('siembras')
  const [farmFilter, setFarmFilter] = useState('all')
  const [cropFilter, setCropFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | InventoryStatus>('all')
  const [sortKey, setSortKey] = useState<SortKey>('nextOp')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const allRows = useMemo(() => buildInventoryRows(farms, fields), [farms, fields])
  const summary = useMemo(() => summarizeInventory(allRows), [allRows])

  const presentCrops = useMemo(
    () => [...new Set(allRows.map(r => r.cropTypeId))]
      .map(id => ({ id, crop: getCropById(id) }))
      .sort((a, b) => localName(a.crop, a.id).localeCompare(localName(b.crop, b.id))),
    [allRows]
  )

  const rows = useMemo(() => {
    const filtered = allRows.filter(r =>
      (farmFilter === 'all' || r.farmId === farmFilter) &&
      (cropFilter === 'all' || r.cropTypeId === cropFilter) &&
      (statusFilter === 'all' || r.status === statusFilter)
    )
    const dir = sortDir === 'asc' ? 1 : -1
    const value = (r: InventoryRow): string | number => {
      switch (sortKey) {
        case 'crop': return localName(getCropById(r.cropTypeId), r.cropTypeId)
        case 'field': return `${r.farmName} ${r.fieldName}`
        case 'plants': return r.plantCount
        case 'planted': return r.plantingDate
        case 'nextOp': return r.nextOp?.date ?? '9999-12-31' // no pending ops sorts last
        case 'harvest': return r.harvestWindow?.start ?? '9999-12-31'
      }
    }
    return filtered.sort((a, b) => {
      const va = value(a), vb = value(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [allRows, farmFilter, cropFilter, statusFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2d4a1e]">{t('inventory.title')}</h1>
        <p className="text-sm text-[#9aab8a] mt-1">
          {t('inventory.subtitle')}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap border-b border-[#e0e8d8]">
        {TABS.map(tabDef => (
          <button
            key={tabDef.id}
            onClick={() => setTab(tabDef.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs border-b-2 -mb-px transition-colors ${
              tab === tabDef.id
                ? 'text-[#2d4a1e] border-[#639922] font-semibold'
                : 'text-[#9aab8a] border-transparent hover:text-[#5a6a4a]'
            }`}
          >
            {tabDef.icon} {t(tabDef.labelKey)}
          </button>
        ))}
      </div>

      {/* ── Labores: what was logged + the month calendar ─────────── */}
      {tab === 'labores' && (
        <div className="flex flex-col gap-6">
          <OperationsLogSection />
          {fields.length > 0 && <OperationsCalendar fields={fields} />}
        </div>
      )}

      {/* ── Cosechas ──────────────────────────────────────────────── */}
      {tab === 'cosechas' && <HarvestLogSection limit={20} />}

      {/* ── Sanidad: recurrence, full history, certifier CSV ──────── */}
      {tab === 'sanidad' && <SanidadRecordsSection />}

      {/* ── Animales ──────────────────────────────────────────────── */}
      {tab === 'animales' && <LivestockSection />}

      {/* ── Siembras: the inventory data grid ─────────────────────── */}
      {tab === 'siembras' && (allRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e0e8d8] px-6 py-12 text-center">
          <p className="text-4xl mb-3">📦</p>
          <h2 className="text-base font-semibold text-[#2d4a1e] mb-1">
            {t('inventory.empty.title')}
          </h2>
          <p className="text-sm text-[#9aab8a] mb-4">
            {t('inventory.empty.description')}
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
          >
            {t('inventory.empty.goToMap')}
          </Link>
        </div>
      ) : (
        <>
          {/* ── Roll-up tiles ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatTile icon={<Package size={16} />} label={t('inventory.tiles.plantings')} value={String(summary.plantings)} />
            <StatTile icon={<Sprout size={16} />} label={t('inventory.tiles.plants')} value={summary.plants.toLocaleString()} />
            <StatTile icon={<Wheat size={16} />} label={t('inventory.tiles.crops')} value={String(summary.crops)} />
            <StatTile icon={<AlertCircle size={16} />} label={t('inventory.tiles.overdueOps')} value={String(summary.overdue)} alert={summary.overdue > 0} />
            <StatTile icon={<ClipboardList size={16} />} label={t('inventory.tiles.pendingOps')} value={String(summary.pending)} />
          </div>

          {/* ── Filters ────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={farmFilter}
              onChange={e => setFarmFilter(e.target.value)}
              className="px-3 py-2 text-xs text-[#2d4a1e] bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            >
              <option value="all">{t('inventory.filters.allFarms')}</option>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select
              value={cropFilter}
              onChange={e => setCropFilter(e.target.value)}
              className="px-3 py-2 text-xs text-[#2d4a1e] bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            >
              <option value="all">{t('inventory.filters.allCrops')}</option>
              {presentCrops.map(({ id, crop }) => (
                <option key={id} value={id}>
                  {crop ? `${crop.emoji} ${localName(crop)}` : id}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | InventoryStatus)}
              className="px-3 py-2 text-xs text-[#2d4a1e] bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            >
              <option value="all">{t('inventory.filters.allStatuses')}</option>
              <option value="overdue">{t('inventory.filters.withOverdue')}</option>
              <option value="dueSoon">{t('inventory.filters.withDueSoon')}</option>
              <option value="ok">{t('inventory.filters.ok')}</option>
              <option value="done">{t('inventory.filters.done')}</option>
            </select>
            <span className="ml-auto text-[11px] text-[#9aab8a]">
              {t('inventory.shownCount', { shown: rows.length, count: allRows.length })}
            </span>
          </div>

          {/* ── Data grid (cards below sm — a 9-column table is unusable
                 at phone width) ─────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
            <div className="sm:hidden divide-y divide-[#f0f5e8]">
              {rows.map(row => (
                <InventoryCardView
                  key={row.id}
                  row={row}
                  expanded={expandedId === row.id}
                  onToggle={() => setExpandedId(prev => (prev === row.id ? null : row.id))}
                />
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e0e8d8] bg-[#f5f8f0] text-left">
                    <th className="w-8" />
                    <SortableTh label={t('inventory.columns.crop')} active={sortKey === 'crop'} dir={sortDir} onClick={() => toggleSort('crop')} />
                    <SortableTh label={t('inventory.columns.farmField')} active={sortKey === 'field'} dir={sortDir} onClick={() => toggleSort('field')} />
                    <th className="px-3 py-3 font-semibold text-[#5a6a4a]">{t('inventory.columns.source')}</th>
                    <SortableTh label={t('inventory.columns.plants')} active={sortKey === 'plants'} dir={sortDir} onClick={() => toggleSort('plants')} />
                    <SortableTh label={t('inventory.columns.planted')} active={sortKey === 'planted'} dir={sortDir} onClick={() => toggleSort('planted')} />
                    <th className="px-3 py-3 font-semibold text-[#5a6a4a]">{t('inventory.columns.status')}</th>
                    <SortableTh label={t('inventory.columns.nextOp')} active={sortKey === 'nextOp'} dir={sortDir} onClick={() => toggleSort('nextOp')} />
                    <SortableTh label={t('inventory.columns.harvestWindow')} active={sortKey === 'harvest'} dir={sortDir} onClick={() => toggleSort('harvest')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f5e8]">
                  {rows.map(row => (
                    <InventoryRowView
                      key={row.id}
                      row={row}
                      expanded={expandedId === row.id}
                      onToggle={() => setExpandedId(prev => (prev === row.id ? null : row.id))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && (
              <p className="px-5 py-8 text-center text-xs text-[#9aab8a]">
                {t('inventory.noMatch')}
              </p>
            )}
          </section>
        </>
      ))}
    </div>
  )
}

function SortableTh({ label, active, dir, onClick }: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
}) {
  return (
    <th className="px-3 py-3">
      <button
        onClick={onClick}
        className={`flex items-center gap-1 font-semibold transition-colors ${
          active ? 'text-[#2d4a1e]' : 'text-[#5a6a4a] hover:text-[#2d4a1e]'
        }`}
      >
        {label}
        <ArrowUpDown size={10} className={active ? 'opacity-100' : 'opacity-40'} />
        {active && <span className="text-[9px]">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}

function InventoryRowView({ row, expanded, onToggle }: {
  row: InventoryRow
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('pages')
  const crop = getCropById(row.cropTypeId)
  const status = STATUS_META[row.status]
  const source = SOURCE_META[row.source]

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-[#fafcf8] transition-colors"
      >
        <td className="pl-3 text-[#9aab8a]">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </td>
        <td className="px-3 py-3">
          <span className="flex items-center gap-1.5 font-medium text-[#2d4a1e]">
            <span className="text-sm">{crop?.emoji ?? '🌱'}</span>
            {localName(crop, row.cropTypeId)}
          </span>
        </td>
        <td className="px-3 py-3 text-[#5a6a4a]">
          <span className="block truncate max-w-40">{row.farmName}</span>
          <span className="block text-[10px] text-[#9aab8a] truncate max-w-40">{row.fieldName}</span>
        </td>
        <td className="px-3 py-3">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#f5f8f0] rounded text-[10px] text-[#5a6a4a]">
            {source.icon} {t(source.labelKey)}
            {row.rowCount > 0 && ` (${row.rowCount})`}
          </span>
        </td>
        <td className="px-3 py-3 font-medium text-[#2d4a1e]">{row.plantCount.toLocaleString()}</td>
        <td className="px-3 py-3 text-[#5a6a4a]">
          {formatDateEs(row.plantingDate)}
          <span className="block text-[10px] text-[#9aab8a]">{t('inventory.ageDays', { count: row.ageDays })}</span>
        </td>
        <td className="px-3 py-3">
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${status.classes}`}>
            {t(status.labelKey)}
          </span>
        </td>
        <td className="px-3 py-3">
          {row.nextOp ? (
            <>
              <span className="block text-[#2d4a1e] truncate max-w-44">{localOpLabel(row.nextOp.labelEs)}</span>
              <span className={`block text-[10px] ${row.nextOp.daysFromToday < 0 ? 'text-red-500 font-semibold' : 'text-[#9aab8a]'}`}>
                {row.nextOp.daysFromToday < 0 ? `${t('inventory.overduePrefix')} ` : ''}
                {formatRelativeDays(row.nextOp.daysFromToday)}
                {row.pendingOpsCount > 1 && ` · ${t('inventory.pendingCount', { count: row.pendingOpsCount })}`}
              </span>
            </>
          ) : (
            <span className="text-[10px] text-[#9aab8a]">{t('inventory.noPending')}</span>
          )}
        </td>
        <td className="px-3 py-3 text-[#5a6a4a]">
          {row.harvestWindow ? (
            <>
              {formatDateEs(row.harvestWindow.start)}
              <span className="block text-[10px] text-[#9aab8a]">
                {t('inventory.until', { date: formatDateEs(row.harvestWindow.end) })}
              </span>
            </>
          ) : (
            <span className="text-[10px] text-[#9aab8a]">—</span>
          )}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={9} className="px-6 py-3 bg-[#fafcf8]">
            <SiembraOperationsList operations={row.operations} />
          </td>
        </tr>
      )}
    </>
  )
}

// The expanded per-siembra operations detail — shared by the desktop
// table's expansion row and the phone card's expansion.
function SiembraOperationsList({ operations }: {
  operations: InventoryRow['operations']
}) {
  const { t } = useTranslation('pages')
  if (operations.length === 0) {
    return (
      <p className="text-[11px] text-[#9aab8a]">
        {t('inventory.noOperations')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold text-[#5a6a4a] uppercase tracking-wide">
        {t('inventory.operationsTitle')}
      </p>
      {operations.map(op => {
        const done = op.status === 'completed' || op.status === 'skipped'
        const overdue = !done && op.daysFromToday < 0
        return (
          <div key={op.id} className="flex items-center gap-2 text-[11px]">
            {done ? (
              <CheckCircle2 size={12} className="text-[#639922] shrink-0" />
            ) : overdue ? (
              <AlertCircle size={12} className="text-red-500 shrink-0" />
            ) : (
              <Clock size={12} className="text-amber-500 shrink-0" />
            )}
            <span className={done ? 'text-[#9aab8a] line-through' : 'text-[#2d4a1e]'}>
              {localOpLabel(op.labelEs)}
            </span>
            <span className="text-[#9aab8a]">
              · {formatDateEs(op.date)}
              {!done && ` (${formatRelativeDays(op.daysFromToday)})`}
              {op.status === 'skipped' && ` (${t('inventory.skipped')})`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Phone rendering of an inventory row: the same facts as the table row,
// stacked into a tappable card.
function InventoryCardView({ row, expanded, onToggle }: {
  row: InventoryRow
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('pages')
  const crop = getCropById(row.cropTypeId)
  const status = STATUS_META[row.status]
  const source = SOURCE_META[row.source]

  return (
    <div
      onClick={onToggle}
      className="px-4 py-3 cursor-pointer hover:bg-[#fafcf8] transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{crop?.emoji ?? '🌱'}</span>
        <span className="flex-1 min-w-0 text-sm font-medium text-[#2d4a1e] truncate">
          {localName(crop, row.cropTypeId)}
        </span>
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${status.classes}`}>
          {t(status.labelKey)}
        </span>
        {expanded
          ? <ChevronDown size={13} className="text-[#9aab8a] shrink-0" />
          : <ChevronRight size={13} className="text-[#9aab8a] shrink-0" />}
      </div>

      <p className="text-[11px] text-[#9aab8a] mt-0.5 truncate">
        {row.farmName} · {row.fieldName}
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-[#5a6a4a]">
        <span>{source.icon} {t(source.labelKey)}{row.rowCount > 0 && ` (${row.rowCount})`}</span>
        <span className="font-medium text-[#2d4a1e]">
          {t('inventory.plantsCount', { count: row.plantCount })}
        </span>
        <span>{formatDateEs(row.plantingDate)} · {t('inventory.ageDays', { count: row.ageDays })}</span>
      </div>

      <div className="mt-1.5 text-[11px]">
        {row.nextOp ? (
          <span>
            <span className="text-[#2d4a1e]">{localOpLabel(row.nextOp.labelEs)}</span>{' '}
            <span className={row.nextOp.daysFromToday < 0 ? 'text-red-500 font-semibold' : 'text-[#9aab8a]'}>
              · {row.nextOp.daysFromToday < 0 ? `${t('inventory.overduePrefix')} ` : ''}
              {formatRelativeDays(row.nextOp.daysFromToday)}
              {row.pendingOpsCount > 1 && ` · ${t('inventory.pendingCount', { count: row.pendingOpsCount })}`}
            </span>
          </span>
        ) : (
          <span className="text-[#9aab8a]">{t('inventory.noPendingOps')}</span>
        )}
        {row.harvestWindow && (
          <span className="block text-[10px] text-[#9aab8a] mt-0.5">
            {t('inventory.harvestRange', {
              start: formatDateEs(row.harvestWindow.start),
              end: formatDateEs(row.harvestWindow.end),
            })}
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-[#f0f5e8]">
          <SiembraOperationsList operations={row.operations} />
        </div>
      )}
    </div>
  )
}

function StatTile({ icon, label, value, alert }: {
  icon: React.ReactNode
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#e0e8d8] px-4 py-3 flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
        alert ? 'bg-red-50 text-red-500' : 'bg-[#eaf3de] text-[#639922]'
      }`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-lg font-bold leading-tight ${alert ? 'text-red-600' : 'text-[#2d4a1e]'}`}>
          {value}
        </p>
        <p className="text-[10px] text-[#9aab8a] truncate">{label}</p>
      </div>
    </div>
  )
}
