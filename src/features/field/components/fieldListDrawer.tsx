import { useState } from 'react'
import {
  ChevronRight, ChevronLeft, Pencil, Trash2,
  MapPin, Square, ToggleLeft, ToggleRight
} from 'lucide-react'
import { useFieldStore } from '@/store/useFieldStore'
import type { PlacedField } from '../types'
import { computeCropSummary } from '../utils/rowCalculator'
import { getCropById } from '../data/cropLibrary'

type Props = {
  onEditField: (fieldId: string) => void
}

export default function FieldListDrawer({ onEditField }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const { fields, updateField, removeField } = useFieldStore()

  function handleToggleDisplay(field: PlacedField) {
    updateField(field.id, {
      displayMode: field.displayMode === 'pin' ? 'shape' : 'pin'
    })
  }

  function handleDelete(fieldId: string) {
    if (window.confirm('¿Estás seguro que quieres eliminar este campo?')) {
      removeField(fieldId)
    }
  }

  return (
    <>
      {/* ── Drawer toggle tab ───────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-[1001] bg-white border border-[#e0e8d8] border-l-0 rounded-r-lg px-1.5 py-4 flex flex-col items-center gap-1 shadow-md hover:bg-[#f5f8f0] transition-colors"
        style={{ marginLeft: isOpen ? 280 : 0, transition: 'margin-left 0.3s ease' }}
      >
        {isOpen
          ? <ChevronLeft size={14} className="text-[#639922]" />
          : <ChevronRight size={14} className="text-[#639922]" />
        }
        <span
          className="text-[9px] font-semibold text-[#5a6a4a] uppercase tracking-wide"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Campos
        </span>
        {fields.length > 0 && (
          <div className="w-4 h-4 rounded-full bg-[#639922] flex items-center justify-center">
            <span className="text-[9px] text-white font-bold">{fields.length}</span>
          </div>
        )}
      </button>

      {/* ── Drawer panel ────────────────────────────────────────────── */}
      <div
        className="absolute left-0 top-0 h-full z-[1000] bg-white border-r border-[#e0e8d8] shadow-xl flex flex-col overflow-hidden"
        style={{
          width: 280,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
              Campos
            </p>
            <p className="text-[10px] text-[#9aab8a] mt-0.5">
              {fields.length} {fields.length === 1 ? 'campo' : 'campos'} en esta finca
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[#9aab8a] hover:bg-[#e8f0e0] transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
        </div>

        {/* Field list */}
        <div className="flex-1 overflow-y-auto">
          {fields.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
              <Square size={24} className="text-[#c0d8a0]" strokeWidth={1.5} />
              <p className="text-xs text-[#9aab8a]">
                No hay campos todavía. Añade tu primer campo desde el mapa.
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[#f0f5e8]">
              {fields.map(field => (
                <FieldListItem
                  key={field.id}
                  field={field}
                  onEdit={() => onEditField(field.id)}
                  onDelete={() => handleDelete(field.id)}
                  onToggleDisplay={() => handleToggleDisplay(field)}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  )
}

// ── Individual field list item ──────────────────────────────────────
function FieldListItem({
  field,
  onEdit,
  onDelete,
  onToggleDisplay,
}: {
  field: PlacedField
  onEdit: () => void
  onDelete: () => void
  onToggleDisplay: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="px-4 py-3 hover:bg-[#fafcf8] transition-colors">

      {/* Field name + color indicator */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: field.color }}
        />
        <span className="text-sm font-medium text-[#2d4a1e] truncate flex-1">
          {field.name}
        </span>
      </div>

      {/* Dimensions */}
      <p className="text-[10px] text-[#9aab8a] mb-2.5">
        {field.widthFt}ft × {field.heightFt}ft
      </p>
          
      {/* Crop summary */}
      {(() => {
      const summary = computeCropSummary(
        field.rows ?? [],
        field.freePlants ?? [],
        getCropById
      )
      if (summary.length === 0) return null
      return (
        <div className="flex flex-wrap gap-2 mb-2">
        {summary.map(c => (
            <div key={c.cropTypeId} className="flex items-center gap-1 px-1.5 py-0.5 bg-[#f5f8f0] rounded">
            <span className="text-xs">{c.emoji}</span>
            <span className="text-[10px] text-[#5a6a4a] font-medium">{c.count}</span>
            </div>
        ))}
        </div>
      )
      })()}

      {/* Pin / Shape toggle */}
      <button
        onClick={onToggleDisplay}
        className="flex items-center gap-1.5 mb-3 text-[10px] text-[#5a6a4a] hover:text-[#2d4a1e] transition-colors"
      >
        {field.displayMode === 'pin' ? (
          <>
            <MapPin size={11} className="text-[#639922]" />
            <span>Mostrar como pin</span>
            <ToggleLeft size={14} className="text-[#c0d0b0] ml-auto" />
          </>
        ) : (
          <>
            <Square size={11} className="text-[#639922]" />
            <span>Mostrar como forma</span>
            <ToggleRight size={14} className="text-[#639922] ml-auto" />
          </>
        )}
      </button>

      {/* Actions */}
      {!confirmDelete ? (
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#639922] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
          >
            <Pencil size={10} />
            Editar
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-[#9aab8a] border border-[#e0e8d8] rounded-lg hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={10} />
            Eliminar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-red-500 text-center">
            ¿Eliminar "{field.name}"?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onDelete}
              className="flex-1 py-1.5 text-[10px] text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              Sí, eliminar
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1.5 text-[10px] text-[#5a6a4a] border border-[#e0e8d8] rounded-lg hover:bg-[#f5f8f0] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

    </div>
  )
}