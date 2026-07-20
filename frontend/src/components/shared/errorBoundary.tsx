import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

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
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[#f7f9f4] px-6 text-center">
        <span className="text-4xl">🥀</span>
        <h1 className="text-lg font-semibold text-[#2d4a1e]">
          Algo salió mal
        </h1>
        <p className="text-sm text-[#5a6a4a] max-w-md">
          Ocurrió un error inesperado en la aplicación. Tus datos guardados no
          se han perdido. Recarga la página para continuar.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm bg-[#2d4a1e] text-[#d4e8b0] rounded-lg hover:bg-[#3d6128] transition-colors"
        >
          Recargar página
        </button>
        <details className="text-left max-w-lg w-full">
          <summary className="text-xs text-[#9aab8a] cursor-pointer">
            Detalles técnicos
          </summary>
          <pre className="mt-2 p-3 bg-white border border-[#e0e8d8] rounded-lg text-[10px] text-red-700 overflow-x-auto">
            {this.state.error.message}
          </pre>
        </details>
      </div>
    )
  }
}
