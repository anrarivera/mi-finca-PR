import { useState } from 'react'
import { X } from 'lucide-react'

type Props = {
  onClose: () => void
  onSubmit: (data: { name: string; location: string }) => void
}

export default function CreateFarmModal({ onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')

  function handleSubmit() {
    if (!name.trim()) return
    onSubmit({ name: name.trim(), location: location.trim() })
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0e8d8]">
            <div>
              <h2 className="text-[#2d4a1e] font-semibold text-base">Nueva finca</h2>
              <p className="text-[#9aab8a] text-xs mt-0.5">
                Añade los datos básicos de tu finca
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9aab8a] hover:bg-[#f0f5e8] hover:text-[#2d4a1e] transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Form */}
          <div className="px-6 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Nombre de la finca <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="Ej. Finca Rivera"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Municipio
              </label>
              <input
                type="text"
                placeholder="Ej. Gurabo, PR"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#e0e8d8] flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#5a6a4a] hover:bg-[#f0f5e8] rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Crear finca
            </button>
          </div>

        </div>
      </div>
    </>
  )
}