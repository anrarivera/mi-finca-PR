import { useTranslation } from 'react-i18next'
import { GraduationCap } from 'lucide-react'
import { dateLocale } from '@/i18n'
import { useAuthStore } from '@/store/useAuthStore'
import { useFarmStore } from '@/store/useFarmStore'
import { useSampleFarmStatus, useSampleFarmBusy } from '@/features/farm/hooks/useSampleFarmApi'
import { useSampleFarmSwitch } from '@/features/farm/hooks/useSampleFarmSwitch'
import { formatResetDate } from '@/features/farm/utils/sampleFarm'

// The demo banner's counterpart for a REAL account: up while the farm
// being explored is the sample farm, so it is never taken for the farmer's
// own. Says when the changes expire, relaunches the tour, and switches the
// sample farm off — the same flow as the switch in Settings. Demo accounts
// keep their own banner (DemoBanner).
export default function SampleFarmBanner() {
  const { t } = useTranslation('pages')
  const isDemo = useAuthStore(s => !!s.user?.isDemo)
  const onSampleFarm = useFarmStore(s => !!s.activeFarm?.isSample)
  const visible = onSampleFarm && !isDemo
  const { data: status } = useSampleFarmStatus(visible)
  const { setEnabled, confirmDialog } = useSampleFarmSwitch()
  const busy = useSampleFarmBusy()

  if (!visible) return null

  const resetDate = formatResetDate(status?.resetsAt, dateLocale())

  return (
    <div className="flex items-center gap-2 px-3 sm:px-5 py-1.5 bg-[#fdf6e3] border-b border-[#f0e6c8] text-[11px] text-[#7a6a3a]">
      <GraduationCap size={13} className="shrink-0 text-[#b8963a]" />
      <span className="truncate">
        {resetDate
          ? t('sampleFarm.banner.text', { date: resetDate })
          : t('sampleFarm.banner.textNoDate')}
      </span>
      <span className="flex-1" />
      <button
        onClick={() => window.dispatchEvent(new Event('demo-tour:start'))}
        disabled={busy}
        className="shrink-0 underline underline-offset-2 hover:text-[#2d4a1e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t('sampleFarm.banner.tour')}
      </button>
      <button
        onClick={() => setEnabled(false)}
        disabled={busy}
        className="shrink-0 px-2.5 py-1 border border-[#e0d2a4] rounded-md font-medium hover:bg-[#f7edcf] hover:text-[#2d4a1e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t('sampleFarm.banner.hide')}
      </button>
      {confirmDialog}
    </div>
  )
}
