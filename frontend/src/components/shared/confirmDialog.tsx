import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

// ──────────────────────────────────────────────────────────────────────────
// Styled replacement for window.confirm(). Use the useConfirm() hook:
//
//   const { confirm, confirmDialog } = useConfirm()
//   ...
//   if (await confirm({ title: '¿Eliminar finca?', message: '...' })) { ... }
//   ...
//   return <>{...page...}{confirmDialog}</>
//
// The dialog closes on Escape or backdrop click (resolving false) and
// focuses the confirm button when it opens.
// ──────────────────────────────────────────────────────────────────────────

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ActiveConfirm = ConfirmOptions & { resolve: (ok: boolean) => void }

function ConfirmDialog({ active }: { active: ActiveConfirm }) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const {
    title, message,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false,
    resolve,
  } = active

  useEffect(() => {
    confirmRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') resolve(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [resolve])

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-[1090] backdrop-blur-sm"
        onClick={() => resolve(false)}
      />
      <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
          className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden pointer-events-auto"
        >
          <div className="px-6 pt-5 pb-4 flex gap-3">
            {danger && (
              <div className="w-9 h-9 shrink-0 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={17} className="text-red-500" />
              </div>
            )}
            <div>
              <h2 className="text-[#2d4a1e] font-semibold text-base">{title}</h2>
              {message && (
                <p className="text-[#5a6a4a] text-sm mt-1.5">{message}</p>
              )}
            </div>
          </div>
          <div className="px-6 py-4 border-t border-[#e0e8d8] flex justify-end gap-2">
            <button
              onClick={() => resolve(false)}
              className="px-4 py-2 text-sm text-[#5a6a4a] hover:bg-[#f0f5e8] rounded-lg transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              onClick={() => resolve(true)}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                danger
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-[#2d4a1e] text-[#d4e8b0] hover:bg-[#3d6128]'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export function useConfirm() {
  const [active, setActive] = useState<ActiveConfirm | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setActive({
        ...options,
        resolve: (ok) => {
          setActive(null)
          resolve(ok)
        },
      })
    })
  }, [])

  const confirmDialog = active ? <ConfirmDialog active={active} /> : null

  return { confirm, confirmDialog }
}
