import TopNav from './topNav'
import SideMenu from './sideMenu'
import DataProvider from './dataProvider'

type Props = {
  children: React.ReactNode
}

export default function Layout({ children }: Props) {
  return (
    <div className="flex flex-col h-screen">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <SideMenu />
        <main className="flex-1 overflow-y-auto p-6 bg-[#f7f9f4]">
          <DataProvider>
            {children}
          </DataProvider>
        </main>
      </div>
    </div>
  )
}