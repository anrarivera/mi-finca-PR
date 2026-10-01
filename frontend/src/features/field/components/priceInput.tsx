import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '@/i18n'

// ──────────────────────────────────────────────────────────────────────────
// Precio de venta — small reusable revenue block for harvest / production
// forms. The stored value is always the TOTAL sale amount; the segmented
// toggle only changes how the farmer types it: the total directly, or a
// price per unit that gets multiplied by the quantity ("30 lb × $0.75").
// Per-unit mode needs a quantity > 0 and is disabled (with a hint) until
// one is entered. Empty input → onChange(null): revenue stays optional.
// ──────────────────────────────────────────────────────────────────────────

type Mode = 'total' | 'perUnit'

const round2 = (n: number) => Math.round(n * 100) / 100

/** "1234.5" → "1,234.50" — money formatting that follows the UI language. */
export function formatMoney(n: number): string {
  return n.toLocaleString(dateLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function PriceInput({ quantity, value, onChange, unitLabel }: {
  /** Quantity the per-unit mode multiplies by (null/0 disables that mode). */
  quantity: number | null
  /** Stored total revenue in dollars. */
  value: number | null
  /** Always reports the TOTAL, regardless of input mode. */
  onChange: (total: number | null) => void
  /** Unit shown in the per-unit counterpart line, e.g. "lb". */
  unitLabel?: string
}) {
  const { t } = useTranslation('field')
  const [mode, setMode] = useState<Mode>('total')
  const [input, setInput] = useState(value != null ? String(value) : '')

  const qty = quantity != null && Number.isFinite(quantity) && quantity > 0
    ? quantity
    : null
  const unit = unitLabel?.trim() || t('price.unitFallback')

  const parsed = parseFloat(input)
  const amount = input.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : null

  function emit(raw: string, m: Mode) {
    setInput(raw)
    const n = parseFloat(raw)
    if (raw.trim() === '' || !Number.isFinite(n) || n < 0) {
      onChange(null)
    } else {
      onChange(m === 'total' ? round2(n) : qty != null ? round2(n * qty) : null)
    }
  }

  function switchMode(next: Mode) {
    if (next === mode) return
    if (next === 'perUnit' && qty == null) return
    setMode(next)
    // Convert the typed number so the stored total is preserved across the
    // switch: total 22.50 over 30 lb becomes 0.75, and back.
    if (value == null) {
      setInput('')
    } else if (next === 'perUnit' && qty != null) {
      setInput(String(parseFloat((value / qty).toFixed(4))))
    } else {
      setInput(String(round2(value)))
    }
  }

  // Quantity cleared while in per-unit mode → the multiplication is gone;
  // fall back to total mode showing the last stored total.
  useEffect(() => {
    if (mode === 'perUnit' && qty == null) {
      setMode('total')
      setInput(value != null ? String(round2(value)) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, mode])

  // Per-unit totals follow the quantity as the farmer edits it.
  useEffect(() => {
    if (mode !== 'perUnit' || qty == null) return
    onChange(amount != null ? round2(amount * qty) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty])

  // Computed counterpart: "= $0.75/lb" in total mode, "= $22.50 total" in
  // per-unit mode — shown only when both sides of the math exist.
  const counterpart = amount != null && qty != null
    ? mode === 'total'
      ? t('price.computedPerUnit', { amount: formatMoney(amount / qty), unit })
      : t('price.computedTotal', { amount: formatMoney(amount * qty) })
    : null

  const segBtn = (active: boolean) =>
    `px-2.5 py-2 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      active
        ? 'bg-[#2d4a1e] text-[#d4e8b0]'
        : 'bg-white text-[#5a6a4a] hover:bg-[#f0f5e8]'
    }`

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[#5a6a4a]">
        {t('price.label')}
        <span className="text-[#66755a] font-normal ml-1">{t('price.optional')}</span>
      </label>

      <div className="flex gap-2">
        {/* Segmented Total | $/unidad toggle */}
        <div className="flex rounded-lg border border-[#d0dcc0] overflow-hidden shrink-0 divide-x divide-[#d0dcc0]">
          <button type="button" onClick={() => switchMode('total')}
            className={segBtn(mode === 'total')}
          >
            {t('price.modeTotal')}
          </button>
          <button type="button" onClick={() => switchMode('perUnit')}
            disabled={qty == null}
            className={segBtn(mode === 'perUnit')}
          >
            {t('price.modePerUnit')}
          </button>
        </div>

        {/* Dollar input */}
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#66755a] pointer-events-none">
            $
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={input}
            onChange={e => emit(e.target.value, mode)}
            placeholder="0.00"
            className="w-full pl-7 pr-3 py-2 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] transition-colors"
          />
        </div>
      </div>

      {counterpart && (
        <p className="text-[10px] text-[#66755a]">{counterpart}</p>
      )}
      {qty == null && (
        <p className="text-[10px] text-[#66755a]">{t('price.needsQuantity')}</p>
      )}
    </div>
  )
}
