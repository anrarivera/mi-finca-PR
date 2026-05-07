import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useResetPassword } from '@/features/auth/hooks/useAuth'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
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
      setError('Las contraseñas no coinciden')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (!token) {
      setError('Token inválido. Por favor solicita un nuevo enlace.')
      return
    }

    try {
      await resetPassword.mutateAsync({ token, password })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al restablecer la contraseña')
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f8f0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌱</div>
          <h1 className="text-2xl font-bold text-[#2d4a1e]">Mi Finca PR</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#e0e8d8] overflow-hidden">
          <div className="bg-[#2d4a1e] px-8 py-6">
            <h2 className="text-lg font-semibold text-[#d4e8b0]">
              Nueva contraseña
            </h2>
            <p className="text-sm text-[#8fba4e] mt-0.5">
              Elige una contraseña segura
            </p>
          </div>

          <div className="px-8 py-6">
            {success ? (
              <div className="text-center py-4">
                <CheckCircle size={40} className="text-[#639922] mx-auto mb-3" />
                <p className="text-sm text-[#2d4a1e] font-medium mb-2">
                  ¡Contraseña actualizada!
                </p>
                <p className="text-sm text-[#7a8a6a]">
                  Redirigiendo al inicio de sesión...
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
                    Nueva contraseña
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aab8a]"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[#5a6a4a]">
                    Confirmar contraseña
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repite tu contraseña"
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
                    <><Loader2 size={15} className="animate-spin" /> Guardando...</>
                  ) : (
                    'Guardar nueva contraseña'
                  )}
                </button>
              </form>
            )}
          </div>

          {!success && (
            <div className="px-8 pb-6 text-center">
              <Link to="/login" className="text-sm text-[#639922] hover:text-[#2d4a1e] transition-colors">
                Volver a iniciar sesión
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}