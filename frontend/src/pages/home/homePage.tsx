import { useState, useEffect } from 'react'
import { useFarmStore } from '@/store/useFarmStore'
import EmptyFarmState from '@/features/farm/components/emptyFarmState'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import FarmMap from '@/features/map/components/farmMap'
import type { Farm } from '@/store/useFarmStore'

export default function HomePage() {
  const [showModal, setShowModal] = useState(false)
  const {
    farms, activeFarm, favoriteFarmId,
    setActiveFarm, addFarm,
  } = useFarmStore()

  // On mount — activate favorite or first farm
  useEffect(() => {
    if (farms.length === 0) return
    const target = farms.find(f => f.id === favoriteFarmId) ?? farms[0]
    setActiveFarm(target)
  }, [])

  function handleCreateFarm(data: { name: string; location: string }) {
    const newFarm: Farm = {
      id: `farm_${Date.now()}`,
      name: data.name,
      location: data.location,
      totalAreaAcres: 0,
      createdAt: new Date().toISOString(),
      boundary: [],
      fieldIds: [],
    }
    addFarm(newFarm)
    setActiveFarm(newFarm)
    setShowModal(false)
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