import { useState, useEffect } from 'react'
import { useFarmStore } from '@/store/useFarmStore'
import EmptyFarmState from '@/features/farm/components/emptyFarmState'
import CreateFarmModal from '@/features/farm/components/createFarmModal'
import FarmMap from '@/features/map/components/farmMap'
import Toast from '@/components/shared/toast' // Added by Claude — confirmation feedback
import type { Farm } from '@/store/useFarmStore'

export default function HomePage() {
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState<string | null>(null) // Added by Claude — confirmation feedback
  const {
    // Claude: removed unused `activeFarm` (TS6133 cleanup)
    farms, favoriteFarmId,
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
    // Added by Claude — visual confirmation that the finca was created
    setToast(`Finca "${newFarm.name}" creada`)
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
      {/* Added by Claude — auto-dismiss confirmation toast (first-farm create) */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}