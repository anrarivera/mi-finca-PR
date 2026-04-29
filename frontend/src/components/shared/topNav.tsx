import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Settings, LogOut } from 'lucide-react'

export default function TopNav() {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleLogout() {
    setOpen(false)
    // logout logic will go here later
    console.log('Logging out...')
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

      {/* Profile button + dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(prev => !prev)}
          className="w-10 h-10 rounded-full bg-[#4a7a2a] border-2 border-[#6aaa3a] text-[#d4e8b0] text-sm font-semibold hover:bg-[#5a8f35] hover:border-[#8fba4e] transition-colors"
        >
          AR
        </button>

        {open && (
          <div className="absolute right-0 top-12 w-48 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-50">

            {/* User info header */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-[#2d4a1e]">Angel R. Rivera</p>
              <p className="text-xs text-gray-400 mt-0.5">anra.rivera@gmail.com</p>
            </div>

            {/* Settings */}
            <button
              onClick={handleSettings}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#3d5a2a] hover:bg-[#f0f5e8] transition-colors"
            >
              <Settings size={15} />
              Settings
            </button>

            <div className="h-px bg-gray-100 mx-2" />

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={15} />
              Log out
            </button>

          </div>
        )}
      </div>
    </nav>
  )
}