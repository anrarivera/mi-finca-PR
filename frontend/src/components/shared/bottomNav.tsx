import { useNavigate, useLocation } from 'react-router-dom'
import { Settings, LayoutDashboard, Map, Calculator, NotebookPen } from 'lucide-react'

const TABS = [
  { path: '/', label: 'Mapa', icon: Map },
  { path: '/dashboard', label: 'Panel', icon: LayoutDashboard },
  { path: '/inventory', label: 'Cuaderno', icon: NotebookPen },
  { path: '/simulator', label: 'Simulador', icon: Calculator },
  { path: '/settings', label: 'Ajustes', icon: Settings },
]

// Phone counterpart of the desktop side rail: a labeled bottom tab bar.
// Logout lives in the top nav's user menu on both form factors.
export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className="sm:hidden shrink-0 flex bg-[#d9ded7] border-t border-[#c5cdc2] pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ path, label, icon: Icon }) => {
        const active = pathname === path
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 transition-colors ${
              active ? 'text-[#2d4a1e]' : 'text-[#7a8a6a]'
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 2} />
            <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
