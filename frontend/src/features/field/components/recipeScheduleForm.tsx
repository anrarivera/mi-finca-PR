import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { RecipeScheduleInput, ApiRecipeVersion } from '../hooks/useRecipesApi'

// ──────────────────────────────────────────────────────────────────────────
// The schedule half of a recipe: harvest window + operation templates.
// Shared by the recipe editor and the custom-crop modal — both keep a
// ScheduleDraft in state and validate it into the API shape on save.
// ──────────────────────────────────────────────────────────────────────────

// Display labels live in the i18n dictionaries under editor:customCrop.opTypes.<value>.
const OP_TYPES = [
  'fertilization', 'spray', 'cultivation', 'irrigation', 'monitoring', 'harvest',
] as const

export type OpDraft = {
  /** Preserved from an existing version so check-off carryover keeps matching. */
  id?: string
  type: string
  labelEs: string
  offsetDays: string
}

export type ScheduleDraft = {
  windowStart: string
  windowEnd: string
  ops: OpDraft[]
}

export function emptyScheduleDraft(defaultOpLabel: string): ScheduleDraft {
  return {
    windowStart: '90',
    windowEnd: '120',
    ops: [{ type: 'fertilization', labelEs: defaultOpLabel, offsetDays: '14' }],
  }
}

export function draftFromVersion(version: ApiRecipeVersion): ScheduleDraft {
  return {
    windowStart: String(version.harvestWindowStartDays),
    windowEnd: String(version.harvestWindowEndDays),
    ops: version.operations.map(op => ({
      id: op.id,
      type: op.type,
      labelEs: op.labelEs,
      offsetDays: String(op.offsetDays),
    })),
  }
}

/** Validate into the API shape; returns an error message key result instead on bad input. */
export function validateScheduleDraft(
  draft: ScheduleDraft,
  t: TFunction<'editor'>
): { schedule: RecipeScheduleInput } | { error: string } {
  const start = Math.round(Number(draft.windowStart))
  const end = Math.round(Number(draft.windowEnd))
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    return { error: t('customCrop.badWindow') }
  }
  const operations: RecipeScheduleInput['operations'] = []
  for (const [i, op] of draft.ops.entries()) {
    const label = op.labelEs.trim()
    const offset = Math.round(Number(op.offsetDays))
    if (!label) return { error: t('customCrop.opNeedsDescription', { number: i + 1 }) }
    if (!Number.isFinite(offset) || offset < 0) {
      return { error: t('customCrop.opNeedsDays', { number: i + 1 }) }
    }
    operations.push({ ...(op.id ? { id: op.id } : {}), type: op.type, labelEs: label, offsetDays: offset })
  }
  return {
    schedule: { harvestWindowStartDays: start, harvestWindowEndDays: end, operations },
  }
}

export default function RecipeScheduleForm({ draft, onChange }: {
  draft: ScheduleDraft
  onChange: (draft: ScheduleDraft) => void
}) {
  const { t } = useTranslation('editor')

  function updateOp(index: number, patch: Partial<OpDraft>) {
    onChange({
      ...draft,
      ops: draft.ops.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    })
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-[#fafcf8] border border-[#e0e8d8] rounded-xl">

      {/* Harvest window */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[#5a6a4a]">{t('customCrop.harvestFrom')}</span>
          <input
            type="number" min={0} value={draft.windowStart}
            onChange={e => onChange({ ...draft, windowStart: e.target.value })}
            className="px-3 py-2 text-sm border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[#5a6a4a]">{t('customCrop.harvestTo')}</span>
          <input
            type="number" min={0} value={draft.windowEnd}
            onChange={e => onChange({ ...draft, windowEnd: e.target.value })}
            className="px-3 py-2 text-sm border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
          />
        </label>
      </div>

      {/* Operation templates */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium text-[#5a6a4a]">
          {t('customCrop.opsLabel')}
        </span>
        {draft.ops.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={o.type}
              onChange={e => updateOp(i, { type: e.target.value })}
              className="px-2 py-1.5 text-xs bg-white border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922] shrink-0"
            >
              {OP_TYPES.map(v => <option key={v} value={v}>{t(`customCrop.opTypes.${v}`)}</option>)}
            </select>
            <input
              value={o.labelEs}
              onChange={e => updateOp(i, { labelEs: e.target.value })}
              placeholder={t('customCrop.descriptionPlaceholder')}
              className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922]"
            />
            <input
              type="number" min={0} value={o.offsetDays}
              onChange={e => updateOp(i, { offsetDays: e.target.value })}
              title={t('customCrop.daysAfterPlanting')}
              className="w-16 px-2 py-1.5 text-xs text-center border border-[#c8dca8] rounded-lg focus:outline-none focus:border-[#639922] shrink-0"
            />
            <button
              onClick={() => onChange({ ...draft, ops: draft.ops.filter((_, j) => j !== i) })}
              aria-label={t('customCrop.deleteOp')}
              className="text-[#66755a] hover:text-red-600 transition-colors shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange({
            ...draft,
            ops: [...draft.ops, { type: 'monitoring', labelEs: '', offsetDays: '30' }],
          })}
          className="flex items-center gap-1.5 self-start px-2.5 py-1.5 text-[11px] text-[#4d7a1b] border border-[#c8dca8] rounded-lg hover:bg-[#eaf3de] transition-colors"
        >
          <Plus size={11} /> {t('customCrop.addOp')}
        </button>
      </div>
    </div>
  )
}
