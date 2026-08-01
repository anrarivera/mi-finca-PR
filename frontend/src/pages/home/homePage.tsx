import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFarmStore } from '@/store/useFarmStore'
import { useCreateFarm } from '@/features/farm/hooks/useFarmsApi'
import EmptyFarmState from '@/features/farm/components/emptyFarmState'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import FarmMap from '@/features/map/components/farmMap'
import { toast } from '@/store/useToastStore'

export default function HomePage() {
  const { t } = useTranslation('pages')
  const [showModal, setShowModal] = useState(false)
  const { farms } = useFarmStore()
  const createFarm = useCreateFarm()

  async function handleCreateFarm(data: { name: string; location: string }) {
    try {
      await createFarm.mutateAsync({
        name: data.name,
        location: data.location,
        farmType: 'mixed',
      })
      toast.success(t('home.farmCreated'))
      setShowModal(false)
    } catch (err) {
      console.error('Failed to create farm:', err)
      alert(t('home.createFarmError'))
    }
  }

  return (
    <div className="flex flex-col h-full relative">
      {farms.length === 0 ? (
        <EmptyFarmState onAddFarm={() => setShowModal(true)} />
      ) : (
        <FarmMap />
      )}
      {showModal && (
        <CreateFarmModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateFarm}
        />
      )}
    </div>
  )
}