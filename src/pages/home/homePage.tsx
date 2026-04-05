import { useState } from 'react'
import { useFarms } from '@/features/farm/hooks/useFarms'
import { useFarmStore } from '@/store/useFarmStore'
import EmptyFarmState from '@/features/farm/components/emptyFarmState'
import FarmStatBar from '@/features/farm/components/farmStatBar'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import type { Farm } from '@/features/farm/hooks/useFarms'
import FarmMap from '@/features/map/components/farmMap'

export default function HomePage() {
  const [showModal, setShowModal] = useState(false)
  const { data: farms = [], isLoading } = useFarms()
  const { activeFarm, setActiveFarm } = useFarmStore()

  // Auto-select first farm if none is active yet
  if (farms.length > 0 && !activeFarm) {
    setActiveFarm(farms[0])
  }

  function handleCreateFarm(data: { name: string; location: string }) {
    // Future: call POST /api/farms, then invalidate ['farms'] query
    console.log('Creating farm:', data)
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

      {/* ── Has farms → show stat bar + map ── */}
      {activeFarm && (
        <>
          <FarmStatBar
            farm={activeFarm}
            allFarms={farms}
            onSwitchFarm={handleSwitchFarm}
            onAddFarm={() => setShowModal(true)}
          />

          <FarmMap />
        </>
      )}

      {/* ── No farms → empty state ── */}
      {!activeFarm && farms.length === 0 && (
        <EmptyFarmState onAddFarm={() => setShowModal(true)} />
      )}

      {/* ── Create Farm Modal ── */}
      {showModal && (
        <CreateFarmModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateFarm}
        />
      )}

    </div>
  )
}