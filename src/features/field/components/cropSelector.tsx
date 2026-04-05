import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'
import { CROP_LIBRARY } from '../data/cropLibrary'
import type { CropType } from '../data/cropLibrary'

type Props = {
  value: string | null
  onChange: (cropId: string) => void
  placeholder?: string
  allowClear?: boolean
}

export default function CropSelector({
  value, onChange, placeholder = 'Seleccionar cultivo', allowClear = false
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedCrop = value ? CROP_LIBRARY.find(c => c.id === value) : null

  const filtered = search.trim()
    ? CROP_LIBRARY.filter(c =>
        c.nameEs.toLowerCase().includes(search.toLowerCase()) ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.category.toLowerCase().includes(search.toLowerCase())
      )
    : CROP_LIBRARY

  // Group filtered results by category
  const grouped = filtered.reduce((acc, crop) => {
    if (!acc[crop.category]) acc[crop.category] = []
    acc[crop.category].push(crop)
    return acc
  }, {} as Record<string, CropType[]>)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(crop: CropType) {
    onChange(crop.id)
    setIsOpen(false)
    setSearch('')
  }

  function handleOpen() {
    setIsOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="relative" ref={containerRef}>

      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[#d0dcc0] bg-white text-sm hover:border-[#639922] transition-colors text-left"
      >
        {selectedCrop ? (
          <>
            <span className="text-base leading-none">{selectedCrop.emoji}</span>
            <span className="flex-1 text-[#2d4a1e] font-medium truncate">
              {selectedCrop.nameEs}
            </span>
          </>
        ) : (
          <span className="flex-1 text-[#b0bea0]">{placeholder}</span>
        )}
        {allowClear && selectedCrop ? (
          <button
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            className="text-[#9aab8a] hover:text-red-400 transition-colors"
          >
            <X size={12} />
          </button>
        ) : (
          <ChevronDown size={14} className="text-[#9aab8a] shrink-0" />
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e0e8d8] rounded-xl shadow-lg z-50 overflow-hidden">

          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#f0f5e8]">
            <Search size={13} className="text-[#9aab8a] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cultivo..."
              className="flex-1 text-xs text-[#2d4a1e] placeholder:text-[#b0bea0] outline-none bg-transparent"
            />
          </div>

          {/* Results */}
          <div className="max-h-52 overflow-y-auto">
            {Object.keys(grouped).length === 0 ? (
              <div className="px-3 py-4 text-xs text-[#9aab8a] text-center">
                No se encontraron resultados
              </div>
            ) : (
              Object.entries(grouped).map(([category, crops]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 text-[9px] font-semibold text-[#9aab8a] uppercase tracking-wider bg-[#fafcf8] border-b border-[#f0f5e8]">
                    {category}
                  </div>
                  {crops.map(crop => (
                    <button
                      key={crop.id}
                      onClick={() => handleSelect(crop)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#f5f8f0] transition-colors text-left ${
                        value === crop.id ? 'bg-[#eaf3de]' : ''
                      }`}
                    >
                      <span className="text-base leading-none w-5 text-center">
                        {crop.emoji}
                      </span>
                      <span className={`${value === crop.id ? 'text-[#2d4a1e] font-medium' : 'text-[#3d5a2a]'}`}>
                        {crop.nameEs}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

        </div>
      )}
    </div>
  )
}