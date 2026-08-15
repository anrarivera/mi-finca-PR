import { useEffect } from 'react'
import TopNav from './topNav'
import DemoBanner from '@/features/demo/demoBanner'
import DemoTour from '@/features/demo/demoTour'
import SideMenu from './sideMenu'
import BottomNav from './bottomNav'
import DataProvider from './dataProvider'
import ToastContainer from './toast'
import { hasUnsavedWork } from '@/store/useUnsavedWorkStore'

type Props = {
  children: React.ReactNode
}

export default function Layout({ children }: Props) {
  // Desktop safety net for tab close / refresh while work is unsaved.
  // Browsers show their own generic message, and most mobile browsers /
  // installed PWAs ignore this event entirely — the in-app guards
  // (useGuardedNavigate, farm-switch confirms) are the real protection.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!hasUnsavedWork()) return
      e.preventDefault()
      e.returnValue = '' // legacy Chrome requires a set returnValue
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return (
    <div className="flex flex-col h-dvh">
      <TopNav />
      <DemoBanner />
      <div className="flex flex-1 overflow-hidden">
        <SideMenu />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 bg-[#f7f9f4]">
          <DataProvider>
            {children}
          </DataProvider>
        </main>
      </div>
      <BottomNav />
      <ToastContainer />
      <DemoTour />
    </div>
  )
}