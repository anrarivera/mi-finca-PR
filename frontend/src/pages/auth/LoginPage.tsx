import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useLogin } from '@/features/auth/hooks/useAuth'
import AuthLayout, { authInputClass, FieldError } from './authLayout'

// Schema is built with t() so validation messages follow the UI language.
const makeLoginSchema = (t: TFunction) => z.object({
  email: z.string().email(t('login.emailInvalid')),
  password: z.string().min(1, t('login.passwordRequired')),
})

type LoginForm = z.infer<ReturnType<typeof makeLoginSchema>>

export default function LoginPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const login = useLogin()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginForm>({ resolver: zodResolver(makeLoginSchema(t)) })

  async function onSubmit(values: LoginForm) {
    setServerError(null)
    try {
      await login.mutateAsync({ email: values.email, password: values.password })
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('429') || message.toLowerCase().includes('rate')) {
        setServerError(t('login.errorRateLimit'))
      } else if (message.includes('401') || message.includes('400') || message.toLowerCase().includes('invalid')) {
        setServerError(t('login.errorInvalidCredentials'))
      } else {
        setServerError(t('login.errorUnexpected'))
      }
    }
  }

  return (
    <AuthLayout
      title={t('login.title')}
      subtitle={t('login.subtitle')}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium text-[#5a6a4a]">
            {t('login.emailLabel')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('login.emailPlaceholder')}
            className={authInputClass}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-medium text-[#5a6a4a]">
            {t('login.passwordLabel')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className={authInputClass}
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>

        {serverError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || login.isPending}
          className="w-full py-2.5 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(isSubmitting || login.isPending) ? t('login.submitting') : t('login.submit')}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#e0e8d8]" />
          <span className="text-xs text-[#66755a]">{t('login.or')}</span>
          <div className="flex-1 h-px bg-[#e0e8d8]" />
        </div>

        <p className="text-xs text-[#5a6a4a] text-center">
          {t('login.noAccount')}{' '}
          <Link to="/register" className="text-[#4d7a1b] font-medium hover:underline">
            {t('login.createAccount')}
          </Link>
        </p>

        <p className="text-xs text-center">
          <Link to="/forgot-password" className="text-[#4d7a1b] hover:underline">
            {t('login.forgotPassword')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}