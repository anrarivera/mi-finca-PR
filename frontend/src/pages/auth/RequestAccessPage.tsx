import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CheckCircle } from 'lucide-react'
import { useRequestAccess } from '@/features/auth/hooks/useAuth'
import AuthLayout, { authInputClass, FieldError } from './authLayout'

// ──────────────────────────────────────────────────────────────────────────
// Where someone without an access code asks for one while the beta is
// closed (SIGNUP_MODE=invite). Linked from the register page, the login
// page and the demo banner — only while the gate is up.
// The server answers every request the same way, whether or not it knew
// the address: the confirmation cannot promise more than "we got it", and
// reminds whoever already has an account that logging in is enough.
// ──────────────────────────────────────────────────────────────────────────

// Schema is built with t() so validation messages follow the UI language.
// The limits are the server's (routes/auth.ts).
const makeRequestAccessSchema = (t: TFunction) => z.object({
  fullName: z.string().trim().min(1, t('requestAccess.nameRequired')).max(100, t('requestAccess.nameMax')),
  email: z.string().email(t('requestAccess.emailInvalid')),
  location: z.string().trim().max(120, t('requestAccess.locationMax')),
  message: z.string().trim().max(1000, t('requestAccess.messageMax')),
})

type RequestAccessForm = z.infer<ReturnType<typeof makeRequestAccessSchema>>

export default function RequestAccessPage() {
  const { t, i18n } = useTranslation('auth')
  const requestAccess = useRequestAccess()
  const [serverError, setServerError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<RequestAccessForm>({ resolver: zodResolver(makeRequestAccessSchema(t)) })

  async function onSubmit(values: RequestAccessForm) {
    setServerError(null)
    try {
      await requestAccess.mutateAsync({
        fullName: values.fullName,
        email: values.email,
        ...(values.location ? { location: values.location } : {}),
        ...(values.message ? { message: values.message } : {}),
        // The language to answer in.
        language: i18n.resolvedLanguage === 'en' ? 'en' : 'es',
      })
      setSentTo(values.email)
    } catch {
      setServerError(t('requestAccess.errorUnexpected'))
    }
  }

  if (sentTo) {
    return (
      <AuthLayout
        title={t('requestAccess.title')}
        subtitle={t('requestAccess.subtitle')}
      >
        <div className="px-8 py-6 text-center">
          <CheckCircle size={40} className="text-[#4d7a1b] mx-auto mb-3" />
          <p className="text-sm text-[#2d4a1e] font-medium mb-2">
            {t('requestAccess.sentTitle')}
          </p>
          <p className="text-sm text-[#5a6a4a] break-words">
            <Trans
              t={t}
              i18nKey="requestAccess.sentBody"
              values={{ email: sentTo }}
              components={{ strong: <span className="font-medium" /> }}
            />
          </p>
          <p className="text-xs mt-5">
            <Link to="/login" className="text-[#4d7a1b] font-medium hover:underline">
              {t('requestAccess.backToLogin')}
            </Link>
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('requestAccess.title')}
      subtitle={t('requestAccess.subtitle')}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-xs font-medium text-[#5a6a4a]">
            {t('requestAccess.nameLabel')}
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder={t('requestAccess.namePlaceholder')}
            className={authInputClass}
            {...register('fullName')}
          />
          <FieldError message={errors.fullName?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium text-[#5a6a4a]">
            {t('requestAccess.emailLabel')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('requestAccess.emailPlaceholder')}
            className={authInputClass}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="location" className="text-xs font-medium text-[#5a6a4a]">
            {t('requestAccess.locationLabel')}{' '}
            <span className="text-[#66755a] font-normal">{t('requestAccess.optional')}</span>
          </label>
          <input
            id="location"
            type="text"
            autoComplete="address-level2"
            placeholder={t('requestAccess.locationPlaceholder')}
            className={authInputClass}
            {...register('location')}
          />
          <FieldError message={errors.location?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="message" className="text-xs font-medium text-[#5a6a4a]">
            {t('requestAccess.messageLabel')}{' '}
            <span className="text-[#66755a] font-normal">{t('requestAccess.optional')}</span>
          </label>
          <textarea
            id="message"
            rows={3}
            placeholder={t('requestAccess.messagePlaceholder')}
            className={`${authInputClass} resize-none`}
            {...register('message')}
          />
          <FieldError message={errors.message?.message} />
        </div>

        {serverError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || requestAccess.isPending}
          className="w-full py-2.5 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(isSubmitting || requestAccess.isPending) ? t('requestAccess.submitting') : t('requestAccess.submit')}
        </button>

        {/* These people have no account and accepted nothing yet — say
            what their name and email are for before they send them. */}
        <p className="text-[11px] text-[#66755a] text-center leading-relaxed">
          {t('requestAccess.privacyNote')}{' '}
          <Link to="/privacy" target="_blank" className="text-[#4d7a1b] hover:underline">
            {t('legal.privacyLink', { ns: 'common' })}
          </Link>
          .
        </p>

        <p className="text-xs text-[#5a6a4a] text-center">
          {t('requestAccess.haveCode')}{' '}
          <Link to="/register" className="text-[#4d7a1b] font-medium hover:underline">
            {t('requestAccess.register')}
          </Link>
        </p>

        <p className="text-xs text-[#5a6a4a] text-center">
          {t('requestAccess.haveAccount')}{' '}
          <Link to="/login" className="text-[#4d7a1b] font-medium hover:underline">
            {t('requestAccess.login')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
