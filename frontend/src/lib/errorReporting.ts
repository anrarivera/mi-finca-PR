import { API_URL } from './api'

// ──────────────────────────────────────────────────────────────────────────
// Client-side error reporting. Uncaught exceptions, unhandled promise
// rejections, and React render crashes are POSTed to the backend, which
// logs them into the same structured stream as server errors — so "a
// farmer's phone broke" is visible in the host logs without a third-party
// service. Deliberately primitive and crash-proof:
//  - fire-and-forget fetch (keepalive survives page unloads)
//  - never throws, never toasts, never recurses
//  - de-duplicates by message per session, hard cap per session
// ──────────────────────────────────────────────────────────────────────────

type ErrorSource = 'window.onerror' | 'unhandledrejection' | 'react-error-boundary'

const seen = new Set<string>()
let reportsLeft = 10

export function reportClientError(source: ErrorSource, error: unknown): void {
  try {
    if (reportsLeft <= 0) return
    const message =
      error instanceof Error ? error.message : String(error ?? 'unknown error')
    const key = `${source}:${message.slice(0, 200)}`
    if (seen.has(key)) return
    seen.add(key)
    reportsLeft--

    const stack = error instanceof Error ? error.stack?.slice(0, 8000) : undefined
    void fetch(`${API_URL}/api/v1/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        message: message.slice(0, 1000),
        stack,
        source,
        url: window.location.href.slice(0, 500),
        userAgent: navigator.userAgent.slice(0, 300),
      }),
    }).catch(() => { /* reporting must never cause errors */ })
  } catch {
    /* reporting must never cause errors */
  }
}

/** Install once at boot — catches everything React doesn't. */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportClientError('window.onerror', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError('unhandledrejection', event.reason)
  })
}
