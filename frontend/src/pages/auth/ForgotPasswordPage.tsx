import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForgotPassword } from '@/features/auth/hooks/useAuth'
import { Loader2, CheckCircle, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const forgotPassword = useForgotPassword()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await forgotPassword.mutateAsync({ email })
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('forgot.errorGeneric'))
    }
  }

  return (
    <div className="min-h-dvh bg-[#f5f8f0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌱</div>
          <h1 className="text-2xl font-bold text-[#2d4a1e]">Mi Finca PR</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e0e8d8] overflow-hidden">
          <div className="bg-[#2d4a1e] px-8 py-6">
            <h2 className="text-lg font-semibold text-[#d4e8b0]">
              {t('forgot.title')}
            </h2>
            <p className="text-sm text-[#8fba4e] mt-0.5">
              {t('forgot.subtitle')}
            </p>
          </div>

          <div className="px-8 py-6">
            {submitted ? (
              <div className="text-center py-4">
                <CheckCircle size={40} className="text-[#639922] mx-auto mb-3" />
                <p className="text-sm text-[#2d4a1e] font-medium mb-2">
                  {t('forgot.sentTitle')}
                </p>
                <p className="text-sm text-[#7a8a6a]">
                  {t('forgot.sentBody')}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error && (
                  <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[#5a6a4a]">
                    {t('forgot.emailLabel')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t('forgot.emailPlaceholder')}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotPassword.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-sm font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-60 mt-2"
                >
                  {forgotPassword.isPending ? (
                    <><Loader2 size={15} className="animate-spin" /> {t('forgot.sending')}</>
                  ) : (
                    t('forgot.submit')
                  )}
                </button>
              </form>
            )}
          </div>

          <div className="px-8 pb-6 text-center">
            <Link
              to="/login"
              className="flex items-center justify-center gap-1.5 text-sm text-[#639922] hover:text-[#2d4a1e] transition-colors"
            >
              <ArrowLeft size={14} />
              {t('forgot.backToLogin')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}