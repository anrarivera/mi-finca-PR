import { useState } from 'react'
import { useFarms } from '@/features/farm/hooks/useFarms'
import { useFarmStore } from '@/store/useFarmStore'
import EmptyFarmState from '@/features/farm/components/emptyFarmState'
import FarmStatBar from '@/features/farm/components/farmStatBar'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import FarmMap from '@/features/map/components/farmMap'
import type { Farm } from '@/store/useFarmStore'

export default function HomePage() {
  const [showModal, setShowModal] = useState(false)
  const { data: farms = [], isLoading } = useFarms()
  const { activeFarm, setActiveFarm, addFarm } = useFarmStore()

  if (farms.length > 0 && !activeFarm) {
    setActiveFarm(farms[0])
  }

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
  }

  function handleSwitchFarm(farm: Farm) {
    setActiveFarm(farm)
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#639922] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      {activeFarm && (
        <>
          <FarmStatBar
            farm={activeFarm}
            allFarms={[...farms, ...(useFarmStore.getState().farms)].filter(
              (f, i, arr) => arr.findIndex(x => x.id === f.id) === i
            )}
            onSwitchFarm={handleSwitchFarm}
            onAddFarm={() => setShowModal(true)}
          />
          <FarmMap />
        </>
      )}
      {!activeFarm && farms.length === 0 && (
        <EmptyFarmState onAddFarm={() => setShowModal(true)} />
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