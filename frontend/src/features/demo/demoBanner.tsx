import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GraduationCap } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'

// Slim persistent bar under the top nav while exploring with a demo
// account: says what this is, relaunches the tour, and offers the real
// conversion action (register).
export default function DemoBanner() {
  const { t } = useTranslation('pages')
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clearAuth)
  const navigate = useNavigate()

  if (!user?.isDemo) return null

  return (
    <div className="flex items-center gap-2 px-3 sm:px-5 py-1.5 bg-[#fdf6e3] border-b border-[#f0e6c8] text-[11px] text-[#7a6a3a]">
      <GraduationCap size={13} className="shrink-0 text-[#b8963a]" />
      <span className="truncate">{t('demoBanner.text')}</span>
      <span className="flex-1" />
      <button
        onClick={() => window.dispatchEvent(new Event('demo-tour:start'))}
        className="shrink-0 underline underline-offset-2 hover:text-[#2d4a1e] transition-colors"
      >
        {t('demoBanner.tour')}
      </button>
      <button
        onClick={() => { clearAuth(); navigate('/register') }}
        className="shrink-0 px-2.5 py-1 bg-[#2d4a1e] text-[#d4e8b0] rounded-md font-medium hover:bg-[#3d6128] transition-colors"
      >
        {t('demoBanner.register')}
      </button>
    </div>
  )
}
