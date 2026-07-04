import { Outlet } from 'react-router-dom'
import TopNav from './topNav'
import SideMenu from './sideMenu'
import ToastContainer from './toast'

export default function Layout() {
  return (
    <div className="h-screen flex flex-col">

      {/* Top navbar — fixed height */}
      <TopNav />

      {/* Everything below the top navbar */}
      <div className="flex flex-1 overflow-hidden">

        {/* Side navbar — full height of remaining space */}
        <SideMenu />

        {/* Page content — scrollable */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#f7f9f4]">
          <Outlet />
        </main>

      </div>

      {/* Global toast queue — any page/component can fire toasts */}
      <ToastContainer />
    </div>
  )
}