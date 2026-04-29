import { Plus, Sprout } from 'lucide-react'

type Props = {
  onAddFarm: () => void
}

export default function EmptyFarmState({ onAddFarm }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full select-none">

      {/* Subtle background texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, #2d4a1e 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />

      {/* Icon */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-[#eaf3de] border border-[#c0dd97] flex items-center justify-center">
          <Sprout size={36} className="text-[#3b6d11]" strokeWidth={1.5} />
        </div>
      </div>

      {/* Message */}
      <p className="text-[#2d4a1e] font-semibold text-lg mb-1 tracking-tight">
        No tienes fincas todavía
      </p>
      <p className="text-[#7a8a6a] text-sm mb-8 text-center max-w-xs leading-relaxed">
        Añade tu primera finca para empezar a gestionar tus cultivos y campos.
      </p>

      {/* Add farm button */}
      <button
        onClick={onAddFarm}
        className="group flex items-center gap-2.5 px-5 py-3 bg-[#2d4a1e] text-[#d4e8b0] rounded-xl text-sm font-medium hover:bg-[#3d6128] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      >
        <div className="w-5 h-5 rounded-full border border-[#8fba4e] flex items-center justify-center group-hover:border-[#d4e8b0] transition-colors">
          <Plus size={12} strokeWidth={2.5} />
        </div>
        Añadir finca
      </button>

    </div>
  )
}