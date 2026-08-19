import { useTranslation } from 'react-i18next'
import { Sprout, CheckCircle2, Wheat } from 'lucide-react'
import { dateLocale, fmtNumber } from '@/i18n'
import {
  useRecipeEvidence, type EvidenceAdherence, type EvidenceYield, type EvidenceVersion,
} from '../hooks/useRecipesApi'

// ──────────────────────────────────────────────────────────────────────────
// The proof behind a recipe (Recetas de Cultivo phase 5): per version —
// newest first, so v(n) sits directly above v(n−1) and the comparison is
// the layout — the plantings that followed it, how faithfully (adherence
// + mean drift), and what they produced. "Did changing my practice work?"
// is answered by reading two version blocks.
// ──────────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function yieldsText(yields: EvidenceYield[], revenue: number | null): string | null {
  if (yields.length === 0) return null
  const parts = yields.map(y => `${fmtNumber(y.quantity)} ${y.unit}`)
  if (revenue !== null) parts.push(`$${fmtNumber(revenue)}`)
  return parts.join(' · ')
}

function AdherenceText({ adherence }: { adherence: EvidenceAdherence }) {
  const { t } = useTranslation('editor')
  if (adherence.pct === null) {
    return <span className="text-[#66755a]">{t('recipes.adherenceNone')}</span>
  }
  const decided = adherence.completed + adherence.skipped
  const drift = adherence.avgDriftDays
  return (
    <span className={adherence.pct >= 80 ? 'text-[#3f6414]' : 'text-amber-600'}>
      {t('recipes.adherenceLabel', { pct: adherence.pct, completed: adherence.completed, decided })}
      {drift !== null && (
        <span className="text-[#66755a]">
          {' · '}
          {drift === 0
            ? t('recipes.driftOnTime')
            : drift > 0
              ? t('recipes.driftLate', { count: drift })
              : t('recipes.driftEarly', { count: -drift })}
        </span>
      )}
      {adherence.open > 0 && (
        <span className="text-[#66755a]"> · {t('recipes.openOps', { count: adherence.open })}</span>
      )}
    </span>
  )
}

function VersionBlock({ version }: { version: EvidenceVersion }) {
  const { t } = useTranslation('editor')
  const production = yieldsText(version.totals.yields, version.totals.revenue)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#eaf3de] text-[#3f6414]">
          v{version.number}
        </span>
        {version.note && <span className="text-[11px] italic text-[#5a6a4a]">"{version.note}"</span>}
        <span className="text-[10px] text-[#66755a]">· {fmtDate(version.createdAt)}</span>
      </div>

      {version.plantings.length === 0 ? (
        <p className="text-[11px] text-[#66755a] pl-1">{t('recipes.versionNoPlantings')}</p>
      ) : (
        <>
          {/* Version roll-up */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] pl-1">
            <span className="flex items-center gap-1 text-[#2d4a1e] font-medium">
              <Sprout size={11} />
              {t('recipes.totalsPlantings', { count: version.totals.plantings })}
              {' · '}{t('recipes.totalsPlants', { count: version.totals.plants })}
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 size={11} className="text-[#4d7a1b]" />
              <AdherenceText adherence={version.totals.adherence} />
            </span>
            <span className="flex items-center gap-1 text-[#2d4a1e]">
              <Wheat size={11} className="text-[#8a6d1a]" />
              {production ?? <span className="text-[#66755a]">{t('recipes.noProduction')}</span>}
            </span>
          </div>

          {/* Per-planting rows */}
          <div className="flex flex-col divide-y divide-[#f0f5e8] border border-[#f0f5e8] rounded-lg bg-white">
            {version.plantings.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-[11px]">
                <span className="text-[#2d4a1e] font-medium min-w-32">
                  {p.farmName} · {p.fieldName}
                </span>
                <span className="text-[#66755a]">
                  {fmtDate(p.plantingDate)} · {t('recipes.totalsPlants', { count: p.plantCount })}
                </span>
                <AdherenceText adherence={p.adherence} />
                {yieldsText(p.yields, p.revenue) && (
                  <span className="text-[#2d4a1e]">{yieldsText(p.yields, p.revenue)}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function RecipeEvidencePanel({ recipeId }: { recipeId: string }) {
  const { t } = useTranslation('editor')
  const { data, isLoading } = useRecipeEvidence(recipeId)

  if (isLoading) {
    return <p className="text-[11px] text-[#66755a] px-4 py-3">{t('recipes.evidenceLoading')}</p>
  }
  if (!data) return null

  const anyPlantings = data.versions.some(v => v.plantings.length > 0)
  return (
    <div className="flex flex-col gap-4 px-4 py-3 bg-[#fafcf8]">
      {!anyPlantings ? (
        <p className="text-[11px] text-[#66755a]">{t('recipes.evidenceEmpty')}</p>
      ) : (
        data.versions.map(v => <VersionBlock key={v.versionId} version={v} />)
      )}
    </div>
  )
}
