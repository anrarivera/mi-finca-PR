import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useRegister } from '@/features/auth/hooks/useAuth'
import { useJoinFarm } from '@/features/farm/hooks/useMembersApi'
import { toast } from '@/store/useToastStore'
import AuthLayout, { authInputClass, FieldError } from './authLayout'

// Schema is built with t() so validation messages follow the UI language.
const makeRegisterSchema = (t: TFunction) => z.object({
  fullName: z.string().trim().min(1, t('register.nameRequired')).max(100, t('register.nameMax')),
  email: z.string().email(t('register.emailInvalid')),
  password: z.string().min(8, t('register.passwordMin')),
  confirmPassword: z.string(),
  inviteCode: z.string().trim().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: t('register.passwordsMismatch'),
  path: ['confirmPassword'],
})

type RegisterForm = z.infer<ReturnType<typeof makeRegisterSchema>>

export default function RegisterPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const registerAccount = useRegister()
  const joinFarm = useJoinFarm()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<RegisterForm>({ resolver: zodResolver(makeRegisterSchema(t)) })

  async function onSubmit(values: RegisterForm) {
    setServerError(null)
    try {
      await registerAccount.mutateAsync({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      })
      // Invite code: redeem right after the account exists. A bad code
      // never blocks registration — the account is already created.
      if (values.inviteCode?.trim()) {
        try {
          const joined = await joinFarm.mutateAsync(values.inviteCode.trim())
          toast.success(t('register.joinSuccess', { farmName: joined.farmName }))
        } catch {
          toast.error(t('register.joinError'))
        }
      }
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('409') || message.toLowerCase().includes('already exists') || message.toLowerCase().includes('ya existe')) {
        setServerError(t('register.errorEmailExists'))
      } else if (message.includes('429')) {
        setServerError(t('register.errorRateLimit'))
      } else if (message.includes('400')) {
        setServerError(message)
      } else {
        setServerError(t('register.errorUnexpected'))
      }
    }
  }

  return (
    <AuthLayout
      title={t('register.title')}
      subtitle={t('register.subtitle')}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-xs font-medium text-[#5a6a4a]">
            {t('register.nameLabel')}
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder={t('register.namePlaceholder')}
            className={authInputClass}
            {...register('fullName')}
          />
          <FieldError message={errors.fullName?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium text-[#5a6a4a]">
            {t('register.emailLabel')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('register.emailPlaceholder')}
            className={authInputClass}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-[#5a6a4a]">
              {t('register.passwordLabel')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder={t('register.passwordPlaceholder')}
              className={authInputClass}
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-xs font-medium text-[#5a6a4a]">
              {t('register.confirmLabel')}
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder={t('register.confirmPlaceholder')}
              className={authInputClass}
              {...register('confirmPassword')}
            />
            <FieldError message={errors.confirmPassword?.message} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="inviteCode" className="text-xs font-medium text-[#5a6a4a]">
            {t('register.inviteLabel')} <span className="text-[#9aab8a] font-normal">{t('register.inviteOptional')}</span>
          </label>
          <input
            id="inviteCode"
            type="text"
            autoComplete="off"
            placeholder={t('register.invitePlaceholder')}
            className={authInputClass}
            {...register('inviteCode')}
          />
        </div>

        {serverError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || registerAccount.isPending}
          className="w-full py-2.5 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(isSubmitting || registerAccount.isPending) ? t('register.submitting') : t('register.submit')}
        </button>

        <p className="text-xs text-[#7a8a6a] text-center">
          {t('register.haveAccount')}{' '}
          <Link to="/login" className="text-[#639922] font-medium hover:underline">
            {t('register.login')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}