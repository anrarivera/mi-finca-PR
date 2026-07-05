// ──────────────────────────────────────────────────────────────────────────
// Minimal API client for the Express backend. The app is offline-first: all
// farm data lives in localStorage and nothing here is required for the app
// to work — auth simply unlocks the cloud account features.
//
// - Base URL comes from VITE_API_URL (defaults to the dev backend).
// - The access token lives in memory (auth store), never in localStorage.
// - The refresh token is an HttpOnly cookie, so requests use
//   credentials: 'include'; on a 401 the client tries one silent refresh
//   and replays the original request.
// ──────────────────────────────────────────────────────────────────────────

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /** Skip Authorization header (login/register/refresh). */
  anonymous?: boolean
}

// The auth store registers its token accessors here to avoid a circular
// import between api.ts and useAuthStore.ts.
let getAccessToken: () => string | null = () => null
let onSessionExpired: () => void = () => {}
let refreshInFlight: Promise<RefreshResult> | null = null

export function bindAuthHandlers(handlers: {
  getAccessToken: () => string | null
  setAccessToken: (token: string | null) => void
  onSessionExpired: () => void
}) {
  getAccessToken = handlers.getAccessToken
  onSessionExpired = handlers.onSessionExpired
  setAccessTokenInternal = handlers.setAccessToken
}
let setAccessTokenInternal: (token: string | null) => void = () => {}

async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token && !options.anonymous) headers['Authorization'] = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.')
  }

  let payload: { success?: boolean; data?: T; error?: { code?: string; message?: string } }
  try {
    payload = await response.json()
  } catch {
    throw new ApiError(response.status, 'BAD_RESPONSE', 'Respuesta inválida del servidor.')
  }

  if (!response.ok || payload.success === false) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'UNKNOWN_ERROR',
      payload.error?.message ?? 'Error inesperado del servidor.',
    )
  }
  return payload.data as T
}

/**
 * Refresh the access token using the HttpOnly cookie. Deduplicated.
 *
 * The failure REASON matters: only a definitive rejection by the backend
 * (401/403 — the refresh token really is invalid) may end the session.
 * A network error or 5xx means "server unreachable", and treating that as
 * a logout would silently destroy a perfectly valid session every time the
 * backend restarts or the connection blips.
 */
export type RefreshResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'unauthorized' | 'unavailable' }

async function doRefresh(): Promise<RefreshResult> {
  try {
    const data = await rawRequest<{ accessToken: string }>(
      '/api/v1/auth/refresh',
      { method: 'POST', anonymous: true },
    )
    setAccessTokenInternal(data.accessToken)
    return { ok: true, token: data.accessToken }
  } catch (err) {
    const unauthorized =
      err instanceof ApiError && (err.status === 401 || err.status === 403)
    return { ok: false, reason: unauthorized ? 'unauthorized' : 'unavailable' }
  }
}

export async function refreshSession(): Promise<RefreshResult> {
  refreshInFlight ??= (async (): Promise<RefreshResult> => {
    try {
      // Refresh tokens are strictly single-use on the backend, so two TABS
      // refreshing at once would race: the loser presents an already-rotated
      // cookie and gets logged out. The Web Locks API serializes across all
      // tabs of the origin — the second tab waits, then refreshes with the
      // NEW cookie (the cookie jar is shared) and succeeds.
      if (typeof navigator !== 'undefined' && 'locks' in navigator) {
        return await navigator.locks.request('mi-finca-session-refresh', doRefresh)
      }
      return await doRefresh()
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options)
  } catch (err) {
    // One silent refresh + retry when the access token expired mid-session.
    if (err instanceof ApiError && err.status === 401 && !options.anonymous) {
      const refreshed = await refreshSession()
      if (refreshed.ok) return rawRequest<T>(path, options)
      if (refreshed.reason === 'unauthorized') onSessionExpired()
    }
    throw err
  }
}
