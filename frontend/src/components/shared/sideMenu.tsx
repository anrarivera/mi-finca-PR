import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Settings, LogOut, LayoutDashboard, Map, Calculator, NotebookPen } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useLogout } from '@/features/auth/hooks/useAuth'
import { useGuardedNavigate } from '@/hooks/useGuardedNavigate'

export default function SideMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { guardedNavigate, confirmLeave } = useGuardedNavigate()
  const user = useAuthStore(s => s.user)
  const logout = useLogout()

  async function handleLogout() {
    // Logging out discards unsaved work even without a route change —
    // confirm once here, then redirect unguarded.
    if (!confirmLeave()) return
    try {
      await logout.mutateAsync()
    } catch {
      // proceed anyway
    }
    navigate('/')
  }

  const itemClass = 'w-10 h-10 flex items-center justify-center rounded-lg text-[#3d5a2a] hover:bg-[#f0f5e8] transition-colors'

  return (
    <nav className="hidden sm:flex w-16 h-full bg-[#d9ded7] flex-col items-center py-6">
      <div className="flex flex-col items-center gap-4">
        <button onClick={() => guardedNavigate('/')} aria-label={t('nav.map')} title={t('nav.map')} className={itemClass}>
          <Map size={20} />
        </button>
        <button data-tour="nav-dashboard" onClick={() => guardedNavigate('/dashboard')} aria-label={t('nav.dashboardLong')} title={t('nav.dashboardLong')} className={itemClass}>
          <LayoutDashboard size={20} />
        </button>
        <button onClick={() => guardedNavigate('/inventory')} aria-label={t('nav.notebookLong')} title={t('nav.notebookLong')} className={itemClass}>
          <NotebookPen size={20} />
        </button>
        <button onClick={() => guardedNavigate('/simulator')} aria-label={t('nav.simulator')} title={t('nav.simulator')} className={itemClass}>
          <Calculator size={20} />
        </button>
      </div>

      <div className="mt-auto flex flex-col items-center gap-4">
        <button onClick={() => guardedNavigate('/settings')} aria-label={t('nav.settingsLong')} title={t('nav.settingsLong')} className={itemClass}>
          <Settings size={20} />
        </button>

        {user && (
          <>
            <div className="h-px w-8 bg-gray-300" />
            <button
              onClick={handleLogout}
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
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