import { useState } from 'react'
import { useFarmStore } from '@/store/useFarmStore'
import { useCreateFarm } from '@/features/farm/hooks/useFarmsApi'
import EmptyFarmState from '@/features/farm/components/emptyFarmState'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import FarmMap from '@/features/map/components/farmMap'

export default function HomePage() {
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
      setShowModal(false)
    } catch (err) {
      console.error('Failed to create farm:', err)
      alert('Error al crear la finca. Por favor intenta de nuevo.')
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