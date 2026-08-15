import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import i18n from '@/i18n'
import { reportClientError } from '@/lib/errorReporting'

// ──────────────────────────────────────────────────────────────────────────
// Top-level error boundary. Without one, any render error unmounts the whole
// app into a blank white page. This keeps the crash contained and gives the
// user a way to recover without losing their localStorage data.
// ──────────────────────────────────────────────────────────────────────────

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado en la interfaz:', error, info.componentStack)
    // Ship the crash to the server logs — a white screen on a farmer's
    // phone is invisible unless it reports itself.
    reportClientError('react-error-boundary', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    // Class components can't use hooks — read the i18n instance directly.
    // The crash screen replaces the whole tree, so missing live re-render
    // on language change is acceptable here.
    const t = (key: string) => i18n.t(key, { ns: 'pages' })

    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 bg-[#f7f9f4] px-6 text-center">
        <span className="text-4xl">🥀</span>
        <h1 className="text-lg font-semibold text-[#2d4a1e]">
          {t('errorBoundary.title')}
        </h1>
        <p className="text-sm text-[#5a6a4a] max-w-md">
          {t('errorBoundary.description')}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
        >
          {t('errorBoundary.reload')}
        </button>
        <details className="text-left max-w-lg w-full">
          <summary className="text-xs text-[#9aab8a] cursor-pointer">
            {t('errorBoundary.details')}
          </summary>
          <pre className="mt-2 p-3 bg-white border border-[#e0e8d8] rounded-lg text-[10px] text-red-700 overflow-x-auto">
            {this.state.error.message}
          </pre>
        </details>
      </div>
    )
  }
}
