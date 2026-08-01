import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRegister } from '@/features/auth/hooks/useAuth'
import { useJoinFarm } from '@/features/farm/hooks/useMembersApi'
import { toast } from '@/store/useToastStore'
import AuthLayout, { authInputClass, FieldError } from './authLayout'

const registerSchema = z.object({
  fullName: z.string().trim().min(1, 'Escribe tu nombre').max(100, 'Máximo 100 caracteres'),
  email: z.string().email('Escribe un email válido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmPassword: z.string(),
  inviteCode: z.string().trim().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const navigate = useNavigate()
  const registerAccount = useRegister()
  const joinFarm = useJoinFarm()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

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
          toast.success(`Ahora eres parte de "${joined.farmName}"`)
        } catch {
          toast.error('El código de invitación no funcionó — puedes unirte luego desde el mapa.')
        }
      }
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('409') || message.toLowerCase().includes('already exists') || message.toLowerCase().includes('ya existe')) {
        setServerError('Ya existe una cuenta con este email.')
      } else if (message.includes('429')) {
        setServerError('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.')
      } else if (message.includes('400')) {
        setServerError(message)
      } else {
        setServerError('Error inesperado. Inténtalo de nuevo.')
      }
    }
  }

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Guarda tu finca en la nube y accede desde cualquier dispositivo"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-xs font-medium text-[#5a6a4a]">
            Nombre completo
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="Ej. Angel R. Rivera"
            className={authInputClass}
            {...register('fullName')}
          />
          <FieldError message={errors.fullName?.message} />
        </div>

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-[#5a6a4a]">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className={authInputClass}
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-xs font-medium text-[#5a6a4a]">
              Confirmar
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Repite la contraseña"
              className={authInputClass}
              {...register('confirmPassword')}
            />
            <FieldError message={errors.confirmPassword?.message} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="inviteCode" className="text-xs font-medium text-[#5a6a4a]">
            Código de invitación <span className="text-[#9aab8a] font-normal">(opcional)</span>
          </label>
          <input
            id="inviteCode"
            type="text"
            autoComplete="off"
            placeholder="¿Te invitaron a una finca? Ej. 7K3M-9QPX"
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
          {(isSubmitting || registerAccount.isPending) ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>

        <p className="text-xs text-[#7a8a6a] text-center">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-[#639922] font-medium hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}