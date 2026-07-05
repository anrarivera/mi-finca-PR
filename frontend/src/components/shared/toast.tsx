import { useEffect } from 'react'
import { Check, AlertCircle, Info } from 'lucide-react'
import { useToastStore } from '@/store/useToastStore'
import type { ToastItem } from '@/store/useToastStore'

// ──────────────────────────────────────────────────────────────────────────
// Toast UI. <ToastContainer/> is mounted once in the app layout and renders
// the global toast queue (see useToastStore). Toasts stack bottom-center,
// auto-dismiss, and support success / error / info variants.
// ──────────────────────────────────────────────────────────────────────────

const VARIANT_STYLES = {
  success: 'bg-[#2d4a1e] text-[#d4e8b0]',
  error: 'bg-[#5a1e1e] text-[#f5c9c9]',
  info: 'bg-[#1e3a5a] text-[#c9dff5]',
} as const

const VARIANT_ICON = {
  success: <Check size={15} className="text-[#8fba4e] shrink-0" />,
  error: <AlertCircle size={15} className="text-[#e07070] shrink-0" />,
  info: <Info size={15} className="text-[#70aae0] shrink-0" />,
} as const

function ToastBanner({ item }: { item: ToastItem }) {
  const dismiss = useToastStore(s => s.dismiss)

  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.duration)
    return () => clearTimeout(timer)
  }, [item.id, item.duration, dismiss])

  return (
    <div
      role="status"
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium pointer-events-auto ${VARIANT_STYLES[item.variant]}`}
    >
      {VARIANT_ICON[item.variant]}
      {item.message}
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] flex flex-col items-center gap-2 pointer-events-none"
    >
      {toasts.map(t => <ToastBanner key={t.id} item={t} />)}
    </div>
  )
}
