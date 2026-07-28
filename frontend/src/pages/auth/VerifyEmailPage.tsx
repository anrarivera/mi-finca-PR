import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useVerifyEmail } from '@/features/auth/hooks/useAuth'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

// ──────────────────────────────────────────────────────────────────────────
// Landing page for the verification link the backend emails on
// verify-email/request: {FRONTEND_URL}/verify-email?token=…
// Redeems the token automatically on load — no form, just a result.
// ──────────────────────────────────────────────────────────────────────────

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const verifyEmail = useVerifyEmail()

  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [errorMsg, setErrorMsg] = useState('')

  // The token is single-use — guard against React StrictMode's double
  // effect invocation in dev, which would burn the token on the first call
  // and then show a spurious "invalid link" from the second.
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    if (!token) {
      setState('error')
      setErrorMsg('El enlace no es válido. Falta el código de verificación.')
      return
    }

    verifyEmail.mutate(
      { token },
      {
        onSuccess: () => setState('success'),
        onError: (err) => {
          setState('error')
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'No se pudo verificar el correo. El enlace pudo haber vencido.'
          )
        },
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
              Verificación de correo
            </h2>
          </div>

          <div className="px-8 py-8 text-center">
            {state === 'verifying' && (
              <>
                <Loader2 size={40} className="text-[#639922] mx-auto mb-3 animate-spin" />
                <p className="text-sm text-[#7a8a6a]">Verificando tu correo...</p>
              </>
            )}

            {state === 'success' && (
              <>
                <CheckCircle size={40} className="text-[#639922] mx-auto mb-3" />
                <p className="text-sm text-[#2d4a1e] font-medium mb-2">
                  ¡Correo verificado!
                </p>
                <p className="text-sm text-[#7a8a6a]">
                  Tu cuenta está lista. Ya puedes usar todas las funciones de Mi Finca PR.
                </p>
              </>
            )}

            {state === 'error' && (
              <>
                <XCircle size={40} className="text-red-400 mx-auto mb-3" />
                <p className="text-sm text-[#2d4a1e] font-medium mb-2">
                  No se pudo verificar
                </p>
                <p className="text-sm text-[#7a8a6a]">{errorMsg}</p>
                <p className="text-xs text-[#9aab8a] mt-3">
                  Puedes pedir un nuevo enlace desde Configuración una vez
                  hayas iniciado sesión.
                </p>
              </>
            )}
          </div>

          <div className="px-8 pb-6 text-center">
            <Link
              to={state === 'success' ? '/' : '/login'}
              className="text-sm text-[#639922] hover:text-[#2d4a1e] transition-colors"
            >
              {state === 'success' ? 'Ir a mi finca' : 'Volver a iniciar sesión'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
