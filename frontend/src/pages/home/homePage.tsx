import { useState } from 'react'
import { useFarmStore } from '@/store/useFarmStore'
import { useFarms, useCreateFarm } from '@/features/farm/hooks/useFarmsApi'
import EmptyFarmState from '@/features/farm/components/emptyFarmState'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import FarmMap from '@/features/map/components/farmMap'

export default function HomePage() {
  const [showModal, setShowModal] = useState(false)
  const { farms } = useFarmStore()
  const { isLoading } = useFarms()
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

  if (isLoading && farms.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">🌱</span>
          <div className="w-6 h-6 rounded-full border-2 border-[#639922] border-t-transparent animate-spin" />
        </div>
      </div>
    )
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