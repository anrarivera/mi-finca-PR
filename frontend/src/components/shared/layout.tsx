import TopNav from './topNav'
import SideMenu from './sideMenu'

type Props = {
  children: React.ReactNode
}

export default function Layout({ children }: Props) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <SideMenu />
        <main className="flex-1 overflow-hidden relative min-h-0">
          {children}
        </main>
      </div>
    </div>
  )
}