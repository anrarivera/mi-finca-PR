import { MapPin, Layers, Leaf, Maximize2, ChevronDown, Plus } from 'lucide-react'
import type { Farm } from '../hooks/useFarms'

type Props = {
  farm: Farm
  allFarms: Farm[]
  onSwitchFarm: (farm: Farm) => void
  onAddFarm: () => void
}

export default function FarmStatBar({ farm, allFarms, onSwitchFarm, onAddFarm }: Props) {
  return (
    <div className="w-full bg-white border-b border-[#e0e8d8] px-6 py-3 flex items-center gap-6 flex-wrap">

      {/* Farm name + switcher */}
      <div className="flex items-center gap-2 min-w-0">
        <MapPin size={14} className="text-[#639922] shrink-0" />
        <span className="text-[#2d4a1e] font-semibold text-sm truncate">{farm.name}</span>
        <span className="text-[#9aab8a] text-xs truncate">{farm.location}</span>

        {/* Farm switcher — only shows if multiple farms */}
        {allFarms.length > 1 && (
          <div className="relative group ml-1">
            <button className="flex items-center gap-1 text-xs text-[#639922] hover:text-[#2d4a1e] transition-colors">
              <ChevronDown size={13} />
            </button>
            <div className="absolute left-0 top-6 hidden group-hover:block bg-white border border-[#e0e8d8] rounded-lg shadow-md w-44 z-50 overflow-hidden">
              {allFarms.map(f => (
                <button
                  key={f.id}
                  onClick={() => onSwitchFarm(f)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    f.id === farm.id
                      ? 'bg-[#eaf3de] text-[#2d4a1e] font-medium'
                      : 'text-[#5a6a4a] hover:bg-[#f5f8f0]'
                  }`}
                >
                  {f.name}
                </button>
              ))}
              <div className="h-px bg-[#e0e8d8] mx-2" />
              <button
                onClick={onAddFarm}
                className="w-full text-left px-3 py-2 text-xs text-[#639922] hover:bg-[#f5f8f0] flex items-center gap-1.5 transition-colors"
              >
                <Plus size={11} /> Añadir finca
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-[#e0e8d8] hidden sm:block" />

      {/* Stats */}
      <div className="flex items-center gap-5 flex-wrap">
        <Stat icon={<Layers size={13} />} label="Campos" value={farm.totalFields} />
        <Stat icon={<Leaf size={13} />} label="Cultivos" value={farm.totalCrops} />
        <Stat icon={<Maximize2 size={13} />} label="Acres" value={farm.totalAreaAcres} />
      </div>

      {/* Add farm — shown if only one farm */}
      {allFarms.length === 1 && (
        <button
          onClick={onAddFarm}
          className="ml-auto flex items-center gap-1.5 text-xs text-[#639922] hover:text-[#2d4a1e] transition-colors"
        >
          <Plus size={13} />
          Añadir finca
        </button>
      )}

    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode, label: string, value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[#9aab8a]">{icon}</span>
      <span className="text-[#2d4a1e] font-semibold text-sm">{value}</span>
      <span className="text-[#9aab8a] text-xs">{label}</span>
    </div>
  )
}