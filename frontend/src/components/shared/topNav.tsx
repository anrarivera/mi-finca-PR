import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Settings, LogOut, LogIn, UserPlus } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { toast } from '@/store/useToastStore'

function initialsFromName(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]!.toUpperCase())
    .join('') || '?'
}

export default function TopNav() {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleLogout() {
    setOpen(false)
    await logout()
    toast.success('Sesión cerrada')
    navigate('/')
  }

  function handleSettings() {
    setOpen(false)
    navigate('/settings')
  }

  return (
    <nav className="w-full h-16 bg-[#2d4a1e] border-b-2 border-[#3d6128] flex items-center justify-between px-6">

      {/* Logo — clicking takes you home */}
      <Link
        to="/"
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
      >
        <span className="text-2xl">🌱</span>
        <span className="font-serif text-[#d4e8b0] text-lg font-bold tracking-wide">
          Mi Finca{' '}
          <span className="text-[#8fba4e] text-xs font-normal tracking-widest uppercase">
            PR
          </span>
        </span>
      </Link>

      {user ? (
        /* Profile button + dropdown */
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(prev => !prev)}
            aria-label="Menú de usuario"
            aria-expanded={open}
            className="w-10 h-10 rounded-full bg-[#4a7a2a] border-2 border-[#6aaa3a] text-[#d4e8b0] text-sm font-semibold hover:bg-[#5a8f35] hover:border-[#8fba4e] transition-colors"
          >
            {initialsFromName(user.fullName)}
          </button>

          {open && (
            <div className="absolute right-0 top-12 w-52 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-[1200]">

              {/* User info header */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-[#2d4a1e] truncate">{user.fullName}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{user.email}</p>
              </div>

              {/* Settings */}
              <button
                onClick={handleSettings}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#3d5a2a] hover:bg-[#f0f5e8] transition-colors"
              >
                <Settings size={15} />
                Configuración
              </button>

              <div className="h-px bg-gray-100 mx-2" />

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={15} />
                Cerrar sesión
              </button>

            </div>
          )}
        </div>
      ) : (
        /* Guest mode — offer login / register */
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#d4e8b0] rounded-lg hover:bg-white/10 transition-colors"
          >
            <LogIn size={13} />
            Iniciar sesión
          </Link>
          <Link
            to="/register"
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-[#639922] text-white rounded-lg hover:bg-[#71ad27] transition-colors"
          >
            <UserPlus size={13} />
            Crear cuenta
          </Link>
        </div>
      )}
    </nav>
  )
}
