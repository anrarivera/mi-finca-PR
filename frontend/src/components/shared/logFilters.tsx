import { useTranslation } from 'react-i18next'
import { ArrowUpDown } from 'lucide-react'
import type { DateRange } from '@/lib/dateRange'

// ──────────────────────────────────────────────────────────────────────────
// Shared bits for the Cuaderno de campo tab filters — the same select
// styling the Siembras grid established, plus the two controls every log
// tab repeats: a date-range preset picker (free from/to inputs are too
// fiddly on phones) and the sortable table header cell.
// ──────────────────────────────────────────────────────────────────────────

export const filterSelectClass =
  'px-3 py-2 text-xs text-[#2d4a1e] bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]'

export type SortDir = 'asc' | 'desc'

/** Sortable table header cell — the Siembras grid's column-sort control. */
export function SortableTh({ label, active, dir, onClick }: {
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

/** Prev/next page controls for the log lists — hidden with one page. */
export function Pager({ page, pageCount, onPage }: {
  page: number
  pageCount: number
  onPage: (page: number) => void
}) {
  const { t } = useTranslation('common')
  if (pageCount <= 1) return null
  const btnClass =
    'px-3 py-1.5 text-xs font-medium text-[#4d7a1b] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  return (
    <div className="flex items-center justify-center gap-3 py-2.5 border-t border-[#f0f5e8]">
      <button onClick={() => onPage(page - 1)} disabled={page <= 1} className={btnClass}>
        ‹ {t('pager.prev')}
      </button>
      <span className="text-[11px] text-[#66755a]">
        {t('pager.pageOf', { page, count: pageCount })}
      </span>
      <button onClick={() => onPage(page + 1)} disabled={page >= pageCount} className={btnClass}>
        {t('pager.next')} ›
      </button>
    </div>
  )
}

export function DateRangeSelect({ value, onChange }: {
  value: DateRange
  onChange: (range: DateRange) => void
}) {
  const { t } = useTranslation('common')
  return (
    <select
      aria-label={t('filters.dateRange')}
      value={value}
      onChange={e => onChange(e.target.value as DateRange)}
      className={filterSelectClass}
    >
      <option value="all">{t('filters.allDates')}</option>
      <option value="30">{t('filters.last30')}</option>
      <option value="90">{t('filters.last90')}</option>
      <option value="year">{t('filters.thisYear')}</option>
    </select>
  )
}
