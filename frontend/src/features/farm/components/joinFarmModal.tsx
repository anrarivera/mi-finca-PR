import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Ticket, X } from 'lucide-react'
import { useJoinFarm } from '../hooks/useMembersApi'
import { toast } from '@/store/useToastStore'

// "Unirme a una finca" — redeem a join code from an existing account.
// Portaled: opens from inside the farm drawer (transform gotcha).
export default function JoinFarmModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('')
  const joinFarm = useJoinFarm()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    joinFarm.mutate(code.trim(), {
      onSuccess: (data) => {
        toast.success(`Ahora eres parte de "${data.farmName}"`)
        onClose()
      },
    })
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2200] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[2300] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-xl overflow-hidden pointer-events-auto w-full rounded-t-2xl sm:max-w-sm sm:rounded-2xl"
        >
          <div className="px-5 py-4 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center justify-between">
            <p className="text-sm font-semibold text-[#2d4a1e] flex items-center gap-1.5">
              <Ticket size={14} className="text-[#639922]" /> Unirme a una finca
            </p>
            <button type="button" onClick={onClose}
              className="w-8 h-8 pointer-coarse:w-11 pointer-coarse:h-11 flex items-center justify-center rounded-lg text-[#9aab8a] hover:bg-[#e8f0e0] transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="px-5 py-4 flex flex-col gap-3">
            <p className="text-[11px] text-[#7a8a6a] leading-relaxed">
              Escribe el código que te compartió el equipo de la finca.
            </p>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="7K3M-9QPX"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-center text-base font-mono tracking-widest uppercase text-[#2d4a1e] focus:outline-none focus:border-[#639922] transition-colors"
            />
            <button
              type="submit"
              disabled={!code.trim() || joinFarm.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-xs font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Unirme
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  )
}
