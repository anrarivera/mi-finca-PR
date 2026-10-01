import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useFieldStore } from '@/store/useFieldStore'
import { ANIMAL_LIBRARY, getAnimalById } from '../data/animalLibrary'
import { todayISO } from '@/features/field/types'
import { localName } from '@/i18n'
import type { AnimalType, LivestockUnit } from '../types'

// ──────────────────────────────────────────────────────────────────────────
// Herd create/edit form — ONE component for every host: the Cuaderno's
// Animales tab, the corral card in the farm drawer, and the field editor's
// "Añadir animales". Portaled to <body> (drawer hosts sit inside a
// transformed panel that would hijack position:fixed) at the modal z-tier.
// fixedFarmId/fixedFieldId lock the farm/corral when the host already
// knows them (e.g. adding animals from inside a corral).
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  unit: LivestockUnit | null
  farms: Array<{ id: string; name: string }>
  /** Lock the owning farm (hides the farm select). */
  fixedFarmId?: string
  /** Lock the corral assignment (hides the corral select). */
  fixedFieldId?: string
  onClose: () => void
  onSave: (data: Omit<LivestockUnit, 'id'>) => void
}

export default function LivestockFormModal({
  unit, farms, fixedFarmId, fixedFieldId, onClose, onSave,
}: Props) {
  const { t } = useTranslation('editor')
  const [animalType, setAnimalType] = useState<AnimalType>(unit?.animalType ?? 'chickens')
  const [name, setName] = useState(unit?.name ?? '')
  const [farmId, setFarmId] = useState(fixedFarmId ?? unit?.farmId ?? farms[0]?.id ?? '')
  const [count, setCount] = useState(unit?.currentCount ?? 10)
  const [acquisitionDate, setAcquisitionDate] = useState(unit?.acquisitionDate ?? todayISO())
  const [notes, setNotes] = useState(unit?.notes ?? '')
  // Optional corral assignment — one of this farm's livestock-kind fields
  const [fieldId, setFieldId] = useState(fixedFieldId ?? unit?.fieldId ?? '')
  const allFields = useFieldStore(s => s.fields)
  const corrales = allFields.filter(f => f.farmId === farmId && f.kind === 'livestock')

  const selectedAnimal = getAnimalById(animalType)
  const valid = name.trim().length > 0 && farmId && count > 0 && !!acquisitionDate

  function handleSubmit() {
    if (!valid) return
    onSave({
      farmId,
      fieldId: fieldId || null,
      name: name.trim(),
      animalType,
      currentCount: count,
      acquisitionDate,
      notes: notes.trim() || undefined,
    })
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors'

  return createPortal(
    <>
      <div aria-hidden="true" className="fixed inset-0 bg-black/30 z-[2200] backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[2300] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div className="bg-white shadow-xl w-full overflow-hidden max-h-[85dvh] overflow-y-auto pointer-events-auto rounded-t-2xl sm:max-w-md sm:rounded-2xl">

          <div className="px-6 py-4 border-b border-[#e0e8d8]">
            <h2 className="text-[#2d4a1e] font-semibold text-base">
              {unit ? t('livestock.editTitle') : t('livestock.addTitle')}
            </h2>
            <p className="text-[#66755a] text-xs mt-0.5">
              {t('livestock.formSubtitle')}
            </p>
          </div>

          <div className="px-6 py-5 flex flex-col gap-4">
            {/* Animal type selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">{t('livestock.animalType')}</label>
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
                    {localName(a)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                {t('livestock.groupName')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder={selectedAnimal?.unitNamePlaceholder ?? t('livestock.groupNamePlaceholder')}
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            {!fixedFarmId && farms.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5a6a4a]">{t('livestock.farm')}</label>
                {/* The farm is fixed once a unit exists — the API scopes
                    livestock under its owning farm (no cross-farm moves). */}
                <select
                  value={farmId}
                  onChange={e => { setFarmId(e.target.value); setFieldId('') }}
                  disabled={!!unit}
                  className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {farms.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Corral — optional; hidden when the host locked it */}
            {!fixedFieldId && corrales.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5a6a4a]">
                  {t('corral.select')} <span className="font-normal text-[#66755a]">{t('common.optional')}</span>
                </label>
                <select
                  value={fieldId}
                  onChange={e => setFieldId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t('corral.noneOption')}</option>
                  {corrales.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#5a6a4a]">
                  {t('livestock.count')} <span className="text-red-400">*</span>
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
                <label className="text-xs font-medium text-[#5a6a4a]">{t('livestock.acquisitionDate')}</label>
                <input
                  type="date"
                  value={acquisitionDate}
                  onChange={e => setAcquisitionDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">{t('livestock.notes')}</label>
              <input
                type="text"
                placeholder={t('livestock.notesPlaceholder')}
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
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!valid}
              className="px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {unit ? t('livestock.saveChanges') : t('livestock.addButton')}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
