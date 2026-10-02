import { useTranslation } from 'react-i18next'
import { GraduationCap } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useLeaveDemo } from '@/features/auth/hooks/useAuth'
import { useAuthConfig } from '@/features/auth/hooks/useAuthConfig'

// Slim persistent bar under the top nav while exploring with a demo
// account: says what this is, relaunches the tour, and offers the real
// conversion action — register, or while the signup gate is up (the
// visitor has no code to register with) request access.
export default function DemoBanner() {
  const { t } = useTranslation('pages')
  const user = useAuthStore(s => s.user)
  const leaveDemo = useLeaveDemo()
  const { gated, isLoading } = useAuthConfig({ enabled: !!user?.isDemo })

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
      {/* Kept out of sight until the gate has answered — the button would
          change its words, and where it leads, under the visitor's finger. */}
      <button
        onClick={() => leaveDemo(gated ? '/request-access' : '/register')}
        className={`shrink-0 px-2.5 py-1 bg-[#2d4a1e] text-[#d4e8b0] rounded-md font-medium hover:bg-[#3d6128] transition-colors ${isLoading ? 'invisible' : ''}`}
      >
        {gated ? t('demoBanner.requestAccess') : t('demoBanner.register')}
      </button>
    </div>
  )
}
