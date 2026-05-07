import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRegister } from '@/features/auth/hooks/useAuth'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'

export default function RegisterPage() {
  const navigate = useNavigate()
  const register = useRegister()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    try {
      await register.mutateAsync({ email, password, fullName })
      setSuccess(true)
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse')
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#f5f8f0] flex items-center justify-center p-4">
        <div className="text-center">
          <CheckCircle size={48} className="text-[#639922] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[#2d4a1e] mb-2">
            ¡Cuenta creada!
          </h2>
          <p className="text-sm text-[#7a8a6a]">
            Te enviamos un correo de verificación. Redirigiendo...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f8f0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌱</div>
          <h1 className="text-2xl font-bold text-[#2d4a1e]">Mi Finca PR</h1>
          <p className="text-sm text-[#7a8a6a] mt-1">
            Gestión agrícola para Puerto Rico
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#e0e8d8] overflow-hidden">

          <div className="bg-[#2d4a1e] px-8 py-6">
            <h2 className="text-lg font-semibold text-[#d4e8b0]">
              Crear cuenta
            </h2>
            <p className="text-sm text-[#8fba4e] mt-0.5">
              Empieza a gestionar tu finca hoy
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-6 flex flex-col gap-4">

            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Full name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Nombre completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Tu nombre"
                required
                className="w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="w-full px-3 py-2.5 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#5a6a4a]">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  className="w-full px-3 py-2.5 pr-10 rounded-lg border border-[#d0dcc0] text-sm text-[#2d4a1e] placeholder:text-[#b0bea0] focus:outline-none focus:border-[#639922] focus:ring-1 focus:ring-[#639922] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aab8a] hover:text-[#5a6a4a] transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        password.length >= i * 3
                          ? password.length >= 12
                            ? 'bg-[#639922]'
                            : 'bg-amber-400'
                          : 'bg-[#e0e8d8]'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={register.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg text-sm font-medium hover:bg-[#3d6128] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {register.isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                'Crear cuenta'
              )}
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-[#e0e8d8]" />
              <span className="text-xs text-[#9aab8a]">o</span>
              <div className="flex-1 h-px bg-[#e0e8d8]" />
            </div>

            <button
              type="button"
              className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-white border border-[#d0dcc0] rounded-lg text-sm text-[#2d4a1e] hover:bg-[#f5f8f0] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar con Google
            </button>

          </form>

          <div className="px-8 pb-6 text-center">
            <p className="text-sm text-[#7a8a6a]">
              ¿Ya tienes cuenta?{' '}
              <Link
                to="/login"
                className="text-[#639922] font-medium hover:text-[#2d4a1e] transition-colors"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-[#9aab8a] mt-6 px-4">
          Al registrarte aceptas nuestros términos de servicio y política de privacidad.
          Tus datos agrícolas son privados y nunca serán compartidos sin tu consentimiento.
        </p>
      </div>
    </div>
  )
}