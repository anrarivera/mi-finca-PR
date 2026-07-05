import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, CalendarDays, CheckCircle2,
  Download, ExternalLink,
} from 'lucide-react'
import { getMonthGrid, collectOpsByDate } from '../utils/calendarGrid'
import { buildOperationsICS, googleCalendarEventUrl } from '../utils/icsExport'
import { getCropById } from '../data/cropLibrary'
import { todayISO } from '../types'
import type { PlacedField } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Month-view calendar of labores across every field. Days show up to three
// crop emojis; clicking a day lists its operations below the grid.
// ──────────────────────────────────────────────────────────────────────────

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const WEEKDAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export default function OperationsCalendar({ fields }: { fields: PlacedField[] }) {
  const today = todayISO()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [monthIndex, setMonthIndex] = useState(() => Number(today.slice(5, 7)) - 1)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const opsByDate = useMemo(() => collectOpsByDate(fields), [fields])
  const weeks = useMemo(() => getMonthGrid(year, monthIndex), [year, monthIndex])

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(year, monthIndex + delta, 1))
    setYear(next.getUTCFullYear())
    setMonthIndex(next.getUTCMonth())
    setSelectedDay(null)
  }

  // Issue #13 — download every pending operation as an .ics file that
  // imports straight into Google Calendar (or Apple/Outlook).
  function handleExportICS() {
    const blob = new Blob([buildOperationsICS(fields)], {
      type: 'text/calendar;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mi-finca-labores-${today}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectedOps = selectedDay ? (opsByDate.get(selectedDay) ?? []) : []

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e8d8]">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-[#639922]" />
          <h2 className="text-sm font-semibold text-[#2d4a1e]">Calendario de labores</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportICS}
            title="Descargar .ics para importar en Google Calendar"
            className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
          >
            <Download size={11} /> Exportar
          </button>
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Mes anterior"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9aab8a] hover:bg-[#f0f5e8] hover:text-[#2d4a1e] transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs font-semibold text-[#2d4a1e] w-32 text-center capitalize">
            {MONTHS_ES[monthIndex]} {year}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Mes siguiente"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9aab8a] hover:bg-[#f0f5e8] hover:text-[#2d4a1e] transition-colors"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="p-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS_ES.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-[#9aab8a] uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map(cell => {
            const ops = opsByDate.get(cell.iso) ?? []
            const pending = ops.filter(o => o.op.status !== 'completed' && o.op.status !== 'skipped')
            const isToday = cell.iso === today
            const isSelected = cell.iso === selectedDay
            const overdue = pending.length > 0 && cell.iso < today
            return (
              <button
                key={cell.iso}
                onClick={() => setSelectedDay(isSelected ? null : cell.iso)}
                disabled={ops.length === 0}
                className={`min-h-14 rounded-lg border p-1 flex flex-col items-center gap-0.5 transition-colors text-left ${
                  isSelected
                    ? 'border-[#639922] bg-[#eaf3de]'
                    : isToday
                    ? 'border-[#639922] bg-white'
                    : 'border-transparent'
                } ${cell.inMonth ? '' : 'opacity-35'} ${
                  ops.length > 0 ? 'hover:bg-[#f5f8f0] cursor-pointer' : 'cursor-default'
                }`}
              >
                <span className={`text-[11px] leading-none ${
                  isToday ? 'font-bold text-[#2d4a1e]' : overdue ? 'font-semibold text-red-600' : 'text-[#5a6a4a]'
                }`}>
                  {cell.day}
                </span>
                {ops.length > 0 && (
                  <span className="text-[11px] leading-none">
                    {[...new Set(ops.map(o => getCropById(o.cropTypeId)?.emoji ?? '🌱'))]
                      .slice(0, 3)
                      .join('')}
                  </span>
                )}
                {pending.length > 0 && (
                  <span className={`text-[9px] leading-none font-bold ${overdue ? 'text-red-500' : 'text-[#639922]'}`}>
                    {pending.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Selected-day details */}
        {selectedDay && selectedOps.length > 0 && (
          <div className="mt-3 border-t border-[#f0f5e8] pt-3 flex flex-col gap-1.5">
            {selectedOps.map(({ op, fieldName, cropTypeId }) => {
              const crop = getCropById(cropTypeId)
              const done = op.status === 'completed' || op.status === 'skipped'
              return (
                <div key={op.id} className="flex items-center gap-2 text-xs">
                  <span aria-hidden>{crop?.emoji ?? '🌱'}</span>
                  <span className={done ? 'text-[#9aab8a] line-through' : 'text-[#2d4a1e] font-medium'}>
                    {op.labelEs}
                  </span>
                  <span className="text-[#9aab8a]">· {fieldName}</span>
                  {op.status === 'completed' ? (
                    <CheckCircle2 size={12} className="text-[#639922] ml-auto shrink-0" />
                  ) : !done && (
                    <a
                      href={googleCalendarEventUrl({ op, fieldName, cropTypeId })}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Añadir a Google Calendar"
                      className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-[#9aab8a] hover:text-[#639922] transition-colors"
                    >
                      <ExternalLink size={11} /> Google
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
