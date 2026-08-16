import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDemoLogin } from '@/features/auth/hooks/useAuth'

// Shared centered-card shell for the login/register pages.
export default function AuthLayout({ title, subtitle, children }: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  const { t } = useTranslation('auth')
  const demoLogin = useDemoLogin()
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#f7f9f4] px-4 py-8">
      <Link to="/" className="flex items-center gap-2 mb-6">
        <span className="text-3xl">🌱</span>
        <span className="font-serif text-[#2d4a1e] text-xl font-bold tracking-wide">
          Mi Finca{' '}
          <span className="text-[#4d7a1b] text-xs font-normal tracking-widest uppercase">PR</span>
        </span>
      </Link>

      <div className="bg-white rounded-2xl shadow-xl border border-[#e0e8d8] w-full max-w-md overflow-hidden">
        <div className="px-8 pt-7 pb-2">
          <h1 className="text-lg font-semibold text-[#2d4a1e]">{title}</h1>
          <p className="text-xs text-[#66755a] mt-1">{subtitle}</p>
        </div>
        {children}
      </div>

      {/* Try-before-signup: creates an ephemeral demo account seeded
          with a sample farm (replaces the pre-backend localStorage mode,
          whose link had been silently bouncing back to /login). */}
      <button
        onClick={() => demoLogin.mutate()}
        disabled={demoLogin.isPending}
        className="mt-5 text-xs text-[#5a6a4a] hover:text-[#2d4a1e] transition-colors disabled:opacity-60"
      >
        {demoLogin.isPending ? t('layout.demoLoading') : t('layout.tryDemo')}
      </button>
    </div>
  )
}

export const authInputClass =
  'w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors'

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-[11px] text-red-600">{message}</p>
}
