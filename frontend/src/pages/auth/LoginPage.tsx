import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLogin } from '@/features/auth/hooks/useAuth'
import AuthLayout, { authInputClass, FieldError } from './authLayout'

const loginSchema = z.object({
  email: z.string().email('Escribe un email válido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginForm) {
    setServerError(null)
    try {
      await login.mutateAsync({ email: values.email, password: values.password })
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('429') || message.toLowerCase().includes('rate')) {
        setServerError('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.')
      } else if (message.includes('401') || message.includes('400') || message.toLowerCase().includes('invalid')) {
        setServerError('Email o contraseña incorrectos.')
      } else {
        setServerError('Error inesperado. Inténtalo de nuevo.')
      }
    }
  }

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Accede a tu cuenta de Mi Finca PR"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium text-[#5a6a4a]">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
            className={authInputClass}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-medium text-[#5a6a4a]">
            Contraseña
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
          {(isSubmitting || login.isPending) ? 'Entrando...' : 'Entrar'}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#e0e8d8]" />
          <span className="text-xs text-[#9aab8a]">o</span>
          <div className="flex-1 h-px bg-[#e0e8d8]" />
        </div>

        <p className="text-xs text-[#7a8a6a] text-center">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-[#639922] font-medium hover:underline">
            Crear cuenta
          </Link>
        </p>

        <p className="text-xs text-center">
          <Link to="/forgot-password" className="text-[#639922] hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}