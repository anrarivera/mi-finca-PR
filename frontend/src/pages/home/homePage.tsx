import { useState, useEffect } from 'react'
import { useFarmStore } from '@/store/useFarmStore'
import { toast } from '@/store/useToastStore'
import EmptyFarmState from '@/features/farm/components/emptyFarmState'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import FarmMap from '@/features/map/components/farmMap'

export default function HomePage() {
  const [showModal, setShowModal] = useState(false)
  const { farms, favoriteFarmId, createFarm, setActiveFarm } = useFarmStore()

  // On mount — activate favorite or first farm
  useEffect(() => {
    if (farms.length === 0) return
    const target = farms.find(f => f.id === favoriteFarmId) ?? farms[0]
    setActiveFarm(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCreateFarm(data: { name: string; location: string }) {
    const farm = createFarm(data)
    setShowModal(false)
    toast.success(`Finca "${farm.name}" creada`)
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
