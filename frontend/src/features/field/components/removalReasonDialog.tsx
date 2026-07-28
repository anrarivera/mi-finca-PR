import { useState } from 'react'
import { Check } from 'lucide-react'
import { REMOVAL_REASONS, type PlantRemovalReason } from './plantEditPanel'

// ──────────────────────────────────────────────────────────────────────────
// Removal-reason dialog — the same died/replaced/harvested/other picker the
// single-plant panel uses, as a standalone modal. Used when deleting whole
// rows that already contain planted plants: removing living plants is a
// farm event, so it gets logged with a reason.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  title: string
  /** e.g. "2 hileras · 48 plantas sembradas" */
  subtitle?: string
  onConfirm: (reason: PlantRemovalReason, notes?: string) => void
  onCancel: () => void
}

export default function RemovalReasonDialog({ title, subtitle, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState<PlantRemovalReason>('died')
  const [notes, setNotes] = useState('')

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[2200] backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-0 z-[2300] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden">

          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0]">
            <p className="text-sm font-semibold text-[#2d4a1e]">{title}</p>
            {subtitle && <p className="text-xs text-[#7a8a6a] mt-0.5">{subtitle}</p>}
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                ¿Por qué se eliminan?
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {REMOVAL_REASONS.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReason(r.id)}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border text-[10px] transition-colors ${
                      reason === r.id
                        ? 'border-[#639922] bg-[#eaf3de] text-[#2d4a1e] font-medium'
                        : 'border-[#e0e8d8] text-[#5a6a4a] hover:border-[#c8dca8] hover:bg-[#fafcf8]'
                    }`}
                  >
                    <span className="text-base">{r.emoji}</span>
                    {r.labelEs}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Nota <span className="text-[#9aab8a] font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej. Daños del huracán"
                className="w-full px-2.5 py-1.5 rounded-lg border border-[#d0dcc0] text-xs text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] transition-colors"
              />
            </div>
          </div>

          <div className="px-5 py-4 border-t border-[#e0e8d8] flex flex-col gap-1.5">
            <button
              onClick={() => onConfirm(reason, notes.trim() || undefined)}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              <Check size={13} /> Confirmar eliminación
            </button>
            <button
              onClick={onCancel}
              className="w-full py-1.5 text-xs text-[#5a6a4a] hover:bg-[#f5f8f0] rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
