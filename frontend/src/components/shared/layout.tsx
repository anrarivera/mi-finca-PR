import TopNav from './topNav'
import SideMenu from './sideMenu'
import BottomNav from './bottomNav'
import DataProvider from './dataProvider'
import ToastContainer from './toast'

type Props = {
  children: React.ReactNode
}

export default function Layout({ children }: Props) {
  return (
    <div className="flex flex-col h-dvh">
      <TopNav />
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
    </div>
  )
}