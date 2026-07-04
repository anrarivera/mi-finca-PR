import { useEffect } from 'react'
import { Check } from 'lucide-react'

// ──────────────────────────────────────────────────────────────────────────
// Added by Claude — lightweight, auto-dismissing confirmation toast.
// The app previously had no way to give the user feedback for actions like
// creating or saving a finca, so those actions appeared to do nothing. This
// renders a small banner at the bottom-center and calls `onClose` after
// `duration` ms so the parent can clear its toast state.
// ──────────────────────────────────────────────────────────────────────────
type Props = {
  message: string
  onClose: () => void
  duration?: number
}

export default function Toast({ message, onClose, duration = 2500 }: Props) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
    // Re-arm whenever the message changes; intentionally not depending on
    // `onClose`/`duration` to avoid resetting the timer on parent re-renders.
  }, [message]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] flex items-center gap-2 px-4 py-2.5 bg-[#2d4a1e] text-[#d4e8b0] rounded-lg shadow-lg text-sm font-medium">
      <Check size={15} className="text-[#8fba4e]" />
      {message}
    </div>
  )
}
