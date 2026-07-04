import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/store/useAuthStore'
import { toast } from '@/store/useToastStore'
import { ApiError } from '@/lib/api'
import AuthLayout, { authInputClass, FieldError } from './authLayout'

const loginSchema = z.object({
  email: z.email('Escribe un email válido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginForm) {
    setServerError(null)
    try {
      const user = await login(values.email, values.password)
      toast.success(`¡Bienvenido de vuelta, ${user.fullName.split(' ')[0]}!`)
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NETWORK_ERROR') {
        setServerError('No se pudo conectar con el servidor. Puedes seguir usando la app sin cuenta.')
      } else if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
        setServerError('Email o contraseña incorrectos.')
      } else if (err instanceof ApiError && err.status === 429) {
        setServerError('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.')
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
          <label htmlFor="email" className="text-xs font-medium text-[#5a6a4a]">Email</label>
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
          <label htmlFor="password" className="text-xs font-medium text-[#5a6a4a]">Contraseña</label>
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
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2.5">{serverError}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="text-xs text-[#7a8a6a] text-center">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-[#639922] font-medium hover:underline">
            Crear cuenta
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
