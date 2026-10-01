import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/useAuthStore'

// ──────────────────────────────────────────────────────────────────────────
// Guided tour for demo accounts — hand-rolled coach marks (no library):
// a spotlight ring over a [data-tour=…] target plus a bilingual card with
// prev/next/skip. Steps can switch routes; targets are polled for after
// navigation and the card falls back to centered when one never appears
// (a resized layout must degrade the tour, never break the app).
// Auto-starts once per demo account; relaunchable via the demo banner's
// "Ver tutorial" (window event 'demo-tour:start').
// ──────────────────────────────────────────────────────────────────────────

type Step = {
  id: string
  /** CSS selector of the highlight target; centered card when absent. */
  target?: string
  route: string
}

const STEPS: Step[] = [
  { id: 'welcome', route: '/' },
  { id: 'map', target: '[data-tour="map"]', route: '/' },
  { id: 'drawer', target: '[data-tour="drawer-tab"]', route: '/' },
  { id: 'boundary', target: '[data-tour="boundary-fab"]', route: '/' },
  { id: 'panel', target: '[data-tour="labores-panel"]', route: '/dashboard' },
  { id: 'cuaderno', target: '[data-tour="cuaderno-tabs"]', route: '/inventory' },
  { id: 'finish', route: '/' },
]

const seenKey = (userId: string) => `demoTourSeen:${userId}`

export default function DemoTour() {
  const { t } = useTranslation('pages')
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const location = useLocation()
  const [stepIndex, setStepIndex] = useState<number | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isDemo = !!user?.isDemo

  // Auto-start once per demo account (after the map has a moment to mount).
  useEffect(() => {
    if (!isDemo || !user) return
    if (localStorage.getItem(seenKey(user.id))) return
    const timer = setTimeout(() => setStepIndex(0), 1500)
    return () => clearTimeout(timer)
  }, [isDemo, user])

  // Relaunch from the banner.
  useEffect(() => {
    function onStart() { setStepIndex(0) }
    window.addEventListener('demo-tour:start', onStart)
    return () => window.removeEventListener('demo-tour:start', onStart)
  }, [])

  const step = stepIndex !== null ? STEPS[stepIndex] : null

  // Navigate to the step's route, then poll for its target.
  useEffect(() => {
    if (!step) return
    if (location.pathname !== step.route) {
      navigate(step.route)
      return // effect re-runs when location changes
    }
    setRect(null)
    if (!step.target) return
    let tries = 0
    pollRef.current = setInterval(() => {
      tries++
      const el = document.querySelector(step.target!) as HTMLElement | null
      if (el && el.getBoundingClientRect().width > 0) {
        el.scrollIntoView({ block: 'nearest' })
        setRect(el.getBoundingClientRect())
        if (pollRef.current) clearInterval(pollRef.current)
      } else if (tries > 16) {
        if (pollRef.current) clearInterval(pollRef.current) // centered fallback
      }
    }, 150)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, location.pathname])

  const end = useCallback(() => {
    if (user) localStorage.setItem(seenKey(user.id), '1')
    setStepIndex(null)
    if (location.pathname !== '/') navigate('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.pathname])

  if (!isDemo || stepIndex === null || !step) return null

  const isLast = stepIndex === STEPS.length - 1

  // Card position: under the target (or above when there's no room),
  // clamped to the viewport; centered when no target resolved.
  const CARD_W = 300
  let cardStyle: React.CSSProperties
  if (rect) {
    const below = rect.bottom + 240 < window.innerHeight
    cardStyle = {
      position: 'fixed',
      top: below ? Math.min(rect.bottom + 14, window.innerHeight - 220) : undefined,
      bottom: below ? undefined : Math.min(Math.max(window.innerHeight - rect.top + 14, 16), window.innerHeight - 240),
      left: Math.max(12, Math.min(rect.left + rect.width / 2 - CARD_W / 2, window.innerWidth - CARD_W - 12)),
    }
  } else {
    cardStyle = {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[3000]" role="dialog" aria-modal="true">
      {/* Spotlight — the ring's giant shadow darkens everything else. */}
      {rect ? (
        <div
          className="fixed rounded-xl border-2 border-[#d4e8b0] transition-all duration-300"
          style={{
            top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(20, 30, 15, 0.55)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(20,30,15,0.55)]" />
      )}

      <div
        style={{ ...cardStyle, width: CARD_W }}
        className="bg-white rounded-xl border border-[#e0e8d8] shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#e0e8d8] bg-[#f5f8f0] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#2d4a1e] uppercase tracking-wide">
            {t(`demoTour.steps.${step.id}.title`)}
          </span>
          <span className="text-[10px] text-[#66755a]">
            {stepIndex + 1}/{STEPS.length}
          </span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-[#5a6a4a] leading-relaxed">
            {t(`demoTour.steps.${step.id}.body`)}
          </p>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                onClick={() => setStepIndex(i => (i ?? 1) - 1)}
                className="px-3 py-2 text-xs text-[#5a6a4a] hover:bg-[#f5f8f0] rounded-lg transition-colors"
              >
                {t('demoTour.back')}
              </button>
            )}
            <button
              onClick={() => (isLast ? end() : setStepIndex(i => (i ?? 0) + 1))}
              className="flex-1 py-2 text-xs font-medium bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
            >
              {isLast ? t('demoTour.finish') : t('demoTour.next')}
            </button>
          </div>
          {!isLast && (
            <button
              onClick={end}
              className="w-full py-1 text-[11px] text-[#66755a] hover:text-[#5a6a4a] transition-colors"
            >
              {t('demoTour.skip')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
