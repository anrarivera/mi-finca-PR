import { useTranslation } from 'react-i18next'

// Marks the sample farm wherever farms are listed by name, so it is never
// taken for one of the farmer's own. Same tones as the sample farm banner.
export default function SampleBadge() {
  const { t } = useTranslation('farm')
  return (
    <span className="shrink-0 px-1.5 py-0.5 bg-[#fdf6e3] border border-[#f0e6c8] rounded-full text-[9px] text-[#7a6a3a] font-bold">
      {t('sampleBadge')}
    </span>
  )
}
