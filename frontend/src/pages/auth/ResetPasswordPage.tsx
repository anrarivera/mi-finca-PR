import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useResetPassword } from '@/features/auth/hooks/useAuth'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const resetPassword = useResetPassword()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError(t('reset.errorMismatch'))
      return
    }
    if (password.length < 8) {
      setError(t('reset.errorMin'))
      return
    }
    if (!token) {
      setError(t('reset.errorToken'))
      return
    }

    try {
      await resetPassword.mutateAsync({ token, password })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reset.errorGeneric'))
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
              {t('reset.title')}
            </h2>
            <p className="text-sm text-[#4d7a1b] mt-0.5">
              {t('reset.subtitle')}
            </p>
          </div>

          <div className="px-8 py-6">
            {success ? (
              <div className="text-center py-4">
                <CheckCircle size={40} className="text-[#4d7a1b] mx-auto mb-3" />
                <p className="text-sm text-[#2d4a1e] font-medium mb-2">
                  {t('reset.successTitle')}
                </p>
                <p className="text-sm text-[#5a6a4a]">
                  {t('reset.successBody')}
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
                    {t('reset.passwordLabel')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={t('reset.passwordPlaceholder')}
                      required
                      className="w-full px-3 py-2.5 pr-10 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#66755a]"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[#5a6a4a]">
                    {t('reset.confirmLabel')}
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder={t('reset.confirmPlaceholder')}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={resetPassword.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-sm font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-60 mt-2"
                >
                  {resetPassword.isPending ? (
                    <><Loader2 size={15} className="animate-spin" /> {t('reset.saving')}</>
                  ) : (
                    t('reset.submit')
                  )}
                </button>
              </form>
            )}
          </div>

          {!success && (
            <div className="px-8 pb-6 text-center">
              <Link to="/login" className="text-sm text-[#4d7a1b] hover:text-[#2d4a1e] transition-colors">
                {t('reset.backToLogin')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}