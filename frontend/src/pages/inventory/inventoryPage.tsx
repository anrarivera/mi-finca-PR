import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, Sprout, AlertCircle, Clock, CheckCircle2, ClipboardList,
  ChevronDown, ChevronRight, ArrowUpDown, Wheat, Rows3, TreeDeciduous,
} from 'lucide-react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFieldStore } from '@/store/useFieldStore'
import { getCropById } from '@/features/field/data/cropLibrary'
import {
  buildInventoryRows, summarizeInventory,
  type InventoryRow, type InventoryStatus,
} from '@/features/inventory/inventoryBuilder'
import { formatRelativeDaysEs } from '@/features/notifications/notificationBuilder'

// ──────────────────────────────────────────────────────────────────────────
// Inventario (issue #15) — every planting across every farm in one data
// grid: crop, origin, plant count, age, status, next operation, and the
// projected harvest window. Rows expand to the planting's full operation
// list. Filterable by farm/crop/status, sortable by the main columns.
// ──────────────────────────────────────────────────────────────────────────

type SortKey = 'crop' | 'field' | 'plants' | 'planted' | 'nextOp' | 'harvest'
type SortDir = 'asc' | 'desc'

const STATUS_META: Record<InventoryStatus, { label: string; classes: string }> = {
  overdue: { label: 'Vencidas', classes: 'bg-red-50 text-red-600' },
  dueSoon: { label: 'Próximas', classes: 'bg-amber-50 text-amber-600' },
  ok: { label: 'Al día', classes: 'bg-[#eaf3de] text-[#639922]' },
  done: { label: 'Completado', classes: 'bg-gray-100 text-gray-500' },
}

const SOURCE_META = {
  rows: { label: 'Hileras', icon: <Rows3 size={11} /> },
  plants: { label: 'Plantas', icon: <TreeDeciduous size={11} /> },
  mixed: { label: 'Mixto', icon: <Sprout size={11} /> },
} as const

function formatDateEs(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function InventoryPage() {
  const farms = useFarmStore(s => s.farms)
  const fields = useFieldStore(s => s.fields)

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
      .sort((a, b) => (a.crop?.nameEs ?? a.id).localeCompare(b.crop?.nameEs ?? b.id)),
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
        case 'crop': return getCropById(r.cropTypeId)?.nameEs ?? r.cropTypeId
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
        <h1 className="text-2xl font-bold text-[#2d4a1e]">Inventario</h1>
        <p className="text-sm text-[#9aab8a] mt-1">
          Todas tus siembras, su estado y las operaciones que vienen
        </p>
      </div>

      {allRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e0e8d8] px-6 py-12 text-center">
          <p className="text-4xl mb-3">📦</p>
          <h2 className="text-base font-semibold text-[#2d4a1e] mb-1">
            El inventario está vacío
          </h2>
          <p className="text-sm text-[#9aab8a] mb-4">
            Siembra cultivos en tus campos desde el mapa y aparecerán aquí con
            sus operaciones y proyecciones.
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
          >
            Ir al mapa
          </Link>
        </div>
      ) : (
        <>
          {/* ── Roll-up tiles ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatTile icon={<Package size={16} />} label="Siembras" value={String(summary.plantings)} />
            <StatTile icon={<Sprout size={16} />} label="Plantas" value={summary.plants.toLocaleString()} />
            <StatTile icon={<Wheat size={16} />} label="Cultivos" value={String(summary.crops)} />
            <StatTile icon={<AlertCircle size={16} />} label="Ops. vencidas" value={String(summary.overdue)} alert={summary.overdue > 0} />
            <StatTile icon={<ClipboardList size={16} />} label="Ops. pendientes" value={String(summary.pending)} />
          </div>

          {/* ── Filters ────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={farmFilter}
              onChange={e => setFarmFilter(e.target.value)}
              className="px-3 py-2 text-xs text-[#2d4a1e] bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            >
              <option value="all">Todas las fincas</option>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select
              value={cropFilter}
              onChange={e => setCropFilter(e.target.value)}
              className="px-3 py-2 text-xs text-[#2d4a1e] bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            >
              <option value="all">Todos los cultivos</option>
              {presentCrops.map(({ id, crop }) => (
                <option key={id} value={id}>
                  {crop ? `${crop.emoji} ${crop.nameEs}` : id}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | InventoryStatus)}
              className="px-3 py-2 text-xs text-[#2d4a1e] bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            >
              <option value="all">Todos los estados</option>
              <option value="overdue">Con operaciones vencidas</option>
              <option value="dueSoon">Con operaciones próximas</option>
              <option value="ok">Al día</option>
              <option value="done">Completadas</option>
            </select>
            <span className="ml-auto text-[11px] text-[#9aab8a]">
              {rows.length} de {allRows.length} siembras
            </span>
          </div>

          {/* ── Data grid ──────────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e0e8d8] bg-[#f5f8f0] text-left">
                    <th className="w-8" />
                    <SortableTh label="Cultivo" active={sortKey === 'crop'} dir={sortDir} onClick={() => toggleSort('crop')} />
                    <SortableTh label="Finca / Campo" active={sortKey === 'field'} dir={sortDir} onClick={() => toggleSort('field')} />
                    <th className="px-3 py-3 font-semibold text-[#5a6a4a]">Origen</th>
                    <SortableTh label="Plantas" active={sortKey === 'plants'} dir={sortDir} onClick={() => toggleSort('plants')} />
                    <SortableTh label="Sembrado" active={sortKey === 'planted'} dir={sortDir} onClick={() => toggleSort('planted')} />
                    <th className="px-3 py-3 font-semibold text-[#5a6a4a]">Estado</th>
                    <SortableTh label="Próxima operación" active={sortKey === 'nextOp'} dir={sortDir} onClick={() => toggleSort('nextOp')} />
                    <SortableTh label="Ventana de cosecha" active={sortKey === 'harvest'} dir={sortDir} onClick={() => toggleSort('harvest')} />
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
                Ninguna siembra coincide con los filtros.
              </p>
            )}
          </section>
        </>
      )}
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
            {crop?.nameEs ?? row.cropTypeId}
          </span>
        </td>
        <td className="px-3 py-3 text-[#5a6a4a]">
          <span className="block truncate max-w-40">{row.farmName}</span>
          <span className="block text-[10px] text-[#9aab8a] truncate max-w-40">{row.fieldName}</span>
        </td>
        <td className="px-3 py-3">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#f5f8f0] rounded text-[10px] text-[#5a6a4a]">
            {source.icon} {source.label}
            {row.rowCount > 0 && ` (${row.rowCount})`}
          </span>
        </td>
        <td className="px-3 py-3 font-medium text-[#2d4a1e]">{row.plantCount.toLocaleString()}</td>
        <td className="px-3 py-3 text-[#5a6a4a]">
          {formatDateEs(row.plantingDate)}
          <span className="block text-[10px] text-[#9aab8a]">{row.ageDays} días</span>
        </td>
        <td className="px-3 py-3">
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${status.classes}`}>
            {status.label}
          </span>
        </td>
        <td className="px-3 py-3">
          {row.nextOp ? (
            <>
              <span className="block text-[#2d4a1e] truncate max-w-44">{row.nextOp.labelEs}</span>
              <span className={`block text-[10px] ${row.nextOp.daysFromToday < 0 ? 'text-red-500 font-semibold' : 'text-[#9aab8a]'}`}>
                {row.nextOp.daysFromToday < 0 ? 'vencida ' : ''}
                {formatRelativeDaysEs(row.nextOp.daysFromToday)}
                {row.pendingOpsCount > 1 && ` · ${row.pendingOpsCount} pendientes`}
              </span>
            </>
          ) : (
            <span className="text-[10px] text-[#9aab8a]">Sin pendientes</span>
          )}
        </td>
        <td className="px-3 py-3 text-[#5a6a4a]">
          {row.harvestWindow ? (
            <>
              {formatDateEs(row.harvestWindow.start)}
              <span className="block text-[10px] text-[#9aab8a]">
                hasta {formatDateEs(row.harvestWindow.end)}
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
            {row.operations.length === 0 ? (
              <p className="text-[11px] text-[#9aab8a]">
                Esta siembra no tiene operaciones programadas.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold text-[#5a6a4a] uppercase tracking-wide">
                  Operaciones de esta siembra
                </p>
                {row.operations.map(op => {
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
                        {op.labelEs}
                      </span>
                      <span className="text-[#9aab8a]">
                        · {formatDateEs(op.date)}
                        {!done && ` (${formatRelativeDaysEs(op.daysFromToday)})`}
                        {op.status === 'skipped' && ' (omitida)'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
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
