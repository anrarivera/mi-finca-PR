import { useNavigate } from 'react-router-dom'
import { Settings, LogOut, LayoutDashboard, Map, Calculator, Package } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useLogout } from '@/features/auth/hooks/useAuth'

export default function SideMenu() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const logout = useLogout()

  async function handleLogout() {
    try {
      await logout.mutateAsync()
    } catch {
      // proceed anyway
    }
    navigate('/')
  }

  const itemClass = 'w-10 h-10 flex items-center justify-center rounded-lg text-[#3d5a2a] hover:bg-[#f0f5e8] transition-colors'

  return (
    <nav className="w-16 h-full bg-[#d9ded7] flex flex-col items-center py-6">
      <div className="flex flex-col items-center gap-4">
        <button onClick={() => navigate('/')} aria-label="Mapa" title="Mapa" className={itemClass}>
          <Map size={20} />
        </button>
        <button onClick={() => navigate('/dashboard')} aria-label="Panel de control" title="Panel de control" className={itemClass}>
          <LayoutDashboard size={20} />
        </button>
        <button onClick={() => navigate('/inventory')} aria-label="Inventario" title="Inventario" className={itemClass}>
          <Package size={20} />
        </button>
        <button onClick={() => navigate('/simulator')} aria-label="Simulador" title="Simulador" className={itemClass}>
          <Calculator size={20} />
        </button>
      </div>

      <div className="mt-auto flex flex-col items-center gap-4">
        <button onClick={() => navigate('/settings')} aria-label="Configuración" title="Configuración" className={itemClass}>
          <Settings size={20} />
        </button>

        {user && (
          <>
            <div className="h-px w-8 bg-gray-300" />
            <button
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="w-10 h-10 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={20} />
            </button>
          </>
        )}
      </div>
    </nav>
  )
}