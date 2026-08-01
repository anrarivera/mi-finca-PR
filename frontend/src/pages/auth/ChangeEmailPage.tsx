import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useConfirmChangeEmail } from '@/features/auth/hooks/useAuth'
import { useAuthStore } from '@/store/useAuthStore'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

// ──────────────────────────────────────────────────────────────────────────
// Landing page for the change-email confirmation link the backend sends to
// the NEW address: {FRONTEND_URL}/change-email?token=…
// On success the backend revokes every session (the JWTs embed the old
// email), so this page clears local auth state and points back to login.
// ──────────────────────────────────────────────────────────────────────────

export default function ChangeEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const confirmChange = useConfirmChangeEmail()

  const [state, setState] = useState<'confirming' | 'success' | 'error'>('confirming')
  const [newEmail, setNewEmail] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Single-use token — see VerifyEmailPage for why this ref guard exists
  // (StrictMode double-mount would consume the token twice).
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    if (!token) {
      setState('error')
      setErrorMsg('El enlace no es válido. Falta el código de confirmación.')
      return
    }

    confirmChange.mutate(
      { token },
      {
        onSuccess: (data) => {
          setNewEmail(data.email)
          setState('success')
          // Old sessions are dead server-side — drop the stale local one too.
          useAuthStore.getState().clearAuth()
        },
        onError: (err) => {
          setState('error')
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'No se pudo confirmar el cambio. El enlace pudo haber vencido.'
          )
        },
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
              Cambio de correo
            </h2>
          </div>

          <div className="px-8 py-8 text-center">
            {state === 'confirming' && (
              <>
                <Loader2 size={40} className="text-[#639922] mx-auto mb-3 animate-spin" />
                <p className="text-sm text-[#7a8a6a]">Confirmando tu nuevo correo...</p>
              </>
            )}

            {state === 'success' && (
              <>
                <CheckCircle size={40} className="text-[#639922] mx-auto mb-3" />
                <p className="text-sm text-[#2d4a1e] font-medium mb-2">
                  ¡Correo actualizado!
                </p>
                <p className="text-sm text-[#7a8a6a]">
                  Tu cuenta ahora usa <span className="font-medium">{newEmail}</span>.
                  Por seguridad, inicia sesión de nuevo con tu nuevo correo.
                </p>
              </>
            )}

            {state === 'error' && (
              <>
                <XCircle size={40} className="text-red-400 mx-auto mb-3" />
                <p className="text-sm text-[#2d4a1e] font-medium mb-2">
                  No se pudo confirmar
                </p>
                <p className="text-sm text-[#7a8a6a]">{errorMsg}</p>
                <p className="text-xs text-[#9aab8a] mt-3">
                  Puedes solicitar el cambio otra vez desde Configuración.
                </p>
              </>
            )}
          </div>

          <div className="px-8 pb-6 text-center">
            <Link to="/login" className="text-sm text-[#639922] hover:text-[#2d4a1e] transition-colors">
              Ir a iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
