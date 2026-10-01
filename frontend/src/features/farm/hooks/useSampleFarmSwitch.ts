import { useTranslation } from 'react-i18next'
import { useConfirm } from '@/components/shared/confirmDialog'
import { toast } from '@/store/useToastStore'
import { useToggleSampleFarm } from './useSampleFarmApi'

// The on/off flow shared by the Settings switch and the banner's
// "Ocultar". Switching off deletes the sample farm along with whatever the
// farmer did in it, so that direction asks first; switching on has nothing
// to lose. The host renders `confirmDialog`, and holds its controls while
// useSampleFarmBusy() says a request is in flight.
export function useSampleFarmSwitch() {
  const { t } = useTranslation('pages')
  const { confirm, confirmDialog } = useConfirm()
  const toggle = useToggleSampleFarm()

  async function setEnabled(enabled: boolean) {
    if (!enabled) {
      const ok = await confirm({
        title: t('sampleFarm.disableConfirm.title'),
        message: t('sampleFarm.disableConfirm.message'),
        confirmLabel: t('sampleFarm.disableConfirm.confirm'),
        danger: true,
      })
      if (!ok) return
    }
    try {
      await toggle.mutateAsync(enabled)
      toast.success(t(enabled ? 'sampleFarm.toasts.enabled' : 'sampleFarm.toasts.disabled'))
    } catch {
      /* the api client already toasted the reason */
    }
  }

  return { setEnabled, confirmDialog }
}
