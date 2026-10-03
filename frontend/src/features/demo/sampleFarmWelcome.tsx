import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirm } from '@/components/shared/confirmDialog'
import { useAuthStore } from '@/store/useAuthStore'
import { useFarms } from '@/features/farm/hooks/useFarmsApi'
import { useSampleFarmSwitch } from '@/features/farm/hooks/useSampleFarmSwitch'
import { shouldOfferSampleFarm } from '@/features/farm/utils/sampleFarm'

const seenKey = (userId: string) => `sampleFarmWelcomeSeen:${userId}`

// The first thing a new REAL account is asked: start in the sample farm,
// tutorial included, or go straight to a farm of their own. Asked once per
// account and browser, and only while the account has no farm at all —
// whoever already has one (their own, a team's, the sample) found their
// way. "Sí" is the Settings switch plus "Ver tutorial"; either answer
// leaves both of those where they were.
export default function SampleFarmWelcome() {
  const { t } = useTranslation('pages')
  const user = useAuthStore(s => s.user)
  const { data: farms } = useFarms()
  const { confirm, confirmDialog } = useConfirm()
  const { setEnabled } = useSampleFarmSwitch()
  const askedRef = useRef(false)

  const offer = !!user && shouldOfferSampleFarm({
    isDemo: !!user.isDemo,
    farmCount: farms?.length,
    seen: !!localStorage.getItem(seenKey(user.id)),
  })

  useEffect(() => {
    if (!offer || !user || askedRef.current) return
    askedRef.current = true
    confirm({
      title: t('sampleFarm.welcome.title'),
      message: t('sampleFarm.welcome.message'),
      confirmLabel: t('sampleFarm.welcome.confirm'),
      cancelLabel: t('sampleFarm.welcome.cancel'),
    }).then(async accepted => {
      localStorage.setItem(seenKey(user.id), '1')
      if (!accepted) return
      await setEnabled(true)
      // Ignored by the tour unless the sample farm became the active farm.
      window.dispatchEvent(new Event('demo-tour:start'))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer])

  return confirmDialog
}
