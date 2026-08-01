import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardList, X } from 'lucide-react'
import { getAnimalById } from '../data/animalLibrary'
import { useLogProduction } from '../hooks/useLivestockApi'
import { toast } from '@/store/useToastStore'
import { todayISO } from '@/features/field/types'
import type { CountReason, LivestockUnit } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Registrar producción — log eggs/milk/honey/meat for a livestock unit.
// Meat products double as the herd ledger: how many animals left and why
// (the server decrements currentCount). Portaled to document.body because
// it opens from inside the farm drawer (transform hijacks position:fixed);
// phone bottom sheet / desktop centered card, same as JoinFarmModal.
// ──────────────────────────────────────────────────────────────────────────

const COUNT_REASONS: CountReason[] = ['slaughtered', 'sold', 'died', 'other']

export default function ProductionModal({
  unit, onClose,
}: {
  unit: LivestockUnit
  onClose: () => void
}) {
  const { t } = useTranslation('editor')
  const animal = getAnimalById(unit.animalType)
  const products = animal?.products ?? []

  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [quantity, setQuantity] = useState('')
  const [qtyUnit, setQtyUnit] = useState(products[0]?.unit ?? '')
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [headCount, setHeadCount] = useState(1)
  const [reason, setReason] = useState<CountReason>('slaughtered')

  const logProduction = useLogProduction()

  const selected = products.find(p => p.id === productId)
  const isMeat = !!selected?.meat
  const qty = parseFloat(quantity)

  const valid =
    !!selected &&
    Number.isFinite(qty) && qty > 0 &&
    qtyUnit.trim().length > 0 &&
    !!date &&
    (!isMeat || (Number.isInteger(headCount) && headCount >= 1 && headCount <= unit.currentCount))

  function handleProductChange(id: string) {
    setProductId(id as (typeof products)[number]['id'])
    // New product → its suggested unit (still editable afterwards)
    const next = products.find(p => p.id === id)
    if (next) setQtyUnit(next.unit)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || logProduction.isPending) return
    logProduction.mutate(
      {
        unitId: unit.id,
        farmId: unit.farmId,
        data: {
          productId,
          quantity: qty,
          unit: qtyUnit.trim(),
          date,
          notes: notes.trim() || undefined,
          ...(isMeat ? { headCount, countReason: reason } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(t('production.logged', { name: unit.name }))
          onClose()
        },
      }
    )
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors'
  const labelClass = 'text-xs font-medium text-[#5a6a4a]'

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2200] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[2300] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-xl pointer-events-auto w-full rounded-t-2xl max-h-[85dvh] overflow-y-auto sm:max-w-sm sm:rounded-2xl"
        >
          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center justify-between sticky top-0">
            <p className="text-sm font-semibold text-[#2d4a1e] flex items-center gap-1.5 min-w-0">
              <ClipboardList size={14} className="text-[#639922] shrink-0" />
              <span className="truncate">{t('production.title', { name: unit.name })}</span>
            </p>
            <button type="button" onClick={onClose}
              className="w-8 h-8 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded-lg text-[#9aab8a] hover:bg-[#e8f0e0] transition-colors shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          <div className="px-5 py-4 flex flex-col gap-3">
            {/* Product */}
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t('production.product')}</label>
              <select
                value={productId}
                onChange={e => handleProductChange(e.target.value)}
                className={inputClass}
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {t(`production.products.${p.id}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity + unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>{t('production.quantity')}</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>{t('production.unit')}</label>
                <input
                  type="text"
                  value={qtyUnit}
                  onChange={e => setQtyUnit(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t('production.date')}</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Meat = herd ledger: how many animals left, and why */}
            {isMeat && (
              <>
                <p className="text-[11px] text-[#7a8a6a] leading-relaxed bg-[#f5f8f0] rounded-lg px-3 py-2">
                  {t('production.meatHint', { count: unit.currentCount })}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>{t('production.headCount')}</label>
                    <input
                      type="number"
                      min={1}
                      max={unit.currentCount}
                      value={headCount}
                      onChange={e => setHeadCount(parseInt(e.target.value) || 1)}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>{t('production.reason')}</label>
                    <select
                      value={reason}
                      onChange={e => setReason(e.target.value as CountReason)}
                      className={inputClass}
                    >
                      {COUNT_REASONS.map(r => (
                        <option key={r} value={r}>{t(`production.reasons.${r}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t('production.notes')}</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('production.notesPlaceholder')}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            <button
              type="submit"
              disabled={!valid || logProduction.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('production.submit')}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  )
}
