import { useState } from 'react'
import { Plus, Pencil, Trash2, PawPrint } from 'lucide-react'
import { useLivestockStore } from '@/store/useLivestockStore'
import { useFarmStore } from '@/store/useFarmStore'
import { ANIMAL_LIBRARY, getAnimalById } from '../data/animalLibrary'
import { useConfirm } from '@/components/shared/confirmDialog'
import { toast } from '@/store/useToastStore'
import { todayISO } from '@/features/field/types'
import type { AnimalType, LivestockUnit } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Livestock management — rendered as a Dashboard section. Units belong to a
// farm; the form asks for farm (when there is more than one), animal type,
// name, count and acquisition date.
// ──────────────────────────────────────────────────────────────────────────

export default function LivestockSection() {
  const { units, addUnit, updateUnit, removeUnit } = useLivestockStore()
  const farms = useFarmStore(s => s.farms)
  const { confirm, confirmDialog } = useConfirm()
  const [editing, setEditing] = useState<LivestockUnit | 'new' | null>(null)

  async function handleDelete(unit: LivestockUnit) {
    const animal = getAnimalById(unit.animalType)
    const ok = await confirm({
      title: `¿Eliminar "${unit.name}"?`,
      message: `Se eliminará este grupo de ${animal?.nameEs.toLowerCase() ?? 'animales'} de tu inventario.`,
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    removeUnit(unit.id)
    toast.success(`"${unit.name}" eliminado`)
  }

  return (
    <section className="bg-white rounded-2xl border border-[#e0e8d8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e8d8]">
        <div className="flex items-center gap-2">
          <PawPrint size={16} className="text-[#639922]" />
          <h2 className="text-sm font-semibold text-[#2d4a1e]">Animales</h2>
          {units.length > 0 && (
            <span className="text-xs text-[#9aab8a]">
              {units.reduce((s, u) => s + u.currentCount, 0)} en total
            </span>
          )}
        </div>
        <button
          onClick={() => setEditing('new')}
          disabled={farms.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={farms.length === 0 ? 'Crea una finca primero' : undefined}
        >
          <Plus size={12} /> Añadir animales
        </button>
      </div>

      {units.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-3xl mb-2">🐔🐐🐝</p>
          <p className="text-xs text-[#9aab8a]">
            {farms.length === 0
              ? 'Crea una finca para empezar a registrar tus animales.'
              : 'No tienes animales registrados. Añade gallinas, cabras, abejas y más.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#f0f5e8]">
          {units.map(unit => {
            const animal = getAnimalById(unit.animalType)
            const farm = farms.find(f => f.id === unit.farmId)
            return (
              <div key={unit.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-2xl" aria-hidden>{animal?.emoji ?? '🐾'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2d4a1e] truncate">{unit.name}</p>
                  <p className="text-[11px] text-[#9aab8a] truncate">
                    {unit.currentCount} {animal ? (unit.currentCount === 1 ? animal.singularEs : animal.nameEs.toLowerCase()) : 'animales'}
                    {farm ? ` · ${farm.name}` : ''}
                    {unit.notes ? ` · ${unit.notes}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setEditing(unit)}
                  aria-label={`Editar ${unit.name}`}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9aab8a] hover:text-[#2d4a1e] hover:bg-[#f0f5e8] transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleDelete(unit)}
                  aria-label={`Eliminar ${unit.name}`}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9aab8a] hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <LivestockFormModal
          unit={editing === 'new' ? null : editing}
          farms={farms.map(f => ({ id: f.id, name: f.name }))}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === 'new') {
              addUnit({ id: `lv_${Date.now()}`, ...data })
              toast.success(`"${data.name}" añadido`)
            } else {
              updateUnit(editing.id, data)
              toast.success(`"${data.name}" actualizado`)
            }
            setEditing(null)
          }}
        />
      )}

      {confirmDialog}
    </section>
  )
}

// ── Create / edit form modal ──────────────────────────────────────────
function LivestockFormModal({
  unit, farms, onClose, onSave,
}: {
  unit: LivestockUnit | null
  farms: Array<{ id: string; name: string }>
  onClose: () => void
  onSave: (data: Omit<LivestockUnit, 'id'>) => void
}) {
  const [animalType, setAnimalType] = useState<AnimalType>(unit?.animalType ?? 'chickens')
  const [name, setName] = useState(unit?.name ?? '')
  const [farmId, setFarmId] = useState(unit?.farmId ?? farms[0]?.id ?? '')
  const [count, setCount] = useState(unit?.currentCount ?? 10)
  const [acquisitionDate, setAcquisitionDate] = useState(unit?.acquisitionDate ?? todayISO())
  const [notes, setNotes] = useState(unit?.notes ?? '')

  const selectedAnimal = getAnimalById(animalType)
  const valid = name.trim().length > 0 && farmId && count > 0 && !!acquisitionDate

  function handleSubmit() {
    if (!valid) return
    onSave({
      farmId,
      name: name.trim(),
      animalType,
      currentCount: count,
      acquisitionDate,
      notes: notes.trim() || undefined,
    })
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors'

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">

          <div className="px-6 py-4 border-b border-[#e0e8d8]">
            <h2 className="text-[#2d4a1e] font-semibold text-base">
              {unit ? 'Editar animales' : 'Añadir animales'}
            </h2>
            <p className="text-[#9aab8a] text-xs mt-0.5">
              Registra un grupo de animales de tu finca
            </p>
          </div>

          <div className="px-6 py-5 flex flex-col gap-4">
            {/* Animal type selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">Tipo de animal</label>
              <div className="grid grid-cols-3 gap-2">
                {ANIMAL_LIBRARY.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAnimalType(a.id)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs transition-colors ${
                      animalType === a.id
                        ? 'border-[#639922] bg-[#eaf3de] text-[#2d4a1e] font-medium'
                        : 'border-[#e0e8d8] text-[#5a6a4a] hover:border-[#c8dca8] hover:bg-[#fafcf8]'
                    }`}
                  >
                    <span className="text-xl">{a.emoji}</span>
                    {a.nameEs}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Nombre del grupo <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder={selectedAnimal?.unitNamePlaceholder ?? 'Ej. Gallinero principal'}
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            {farms.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5a6a4a]">Finca</label>
                <select
                  value={farmId}
                  onChange={e => setFarmId(e.target.value)}
                  className={inputClass}
                >
                  {farms.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5a6a4a]">
                  Cantidad <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={count}
                  onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5a6a4a]">Fecha de adquisición</label>
                <input
                  type="date"
                  value={acquisitionDate}
                  onChange={e => setAcquisitionDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">Notas</label>
              <input
                type="text"
                placeholder="Ej. Ponedoras Rhode Island Red"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-[#e0e8d8] flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#5a6a4a] hover:bg-[#f0f5e8] rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!valid}
              className="px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {unit ? 'Guardar cambios' : 'Añadir'}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
