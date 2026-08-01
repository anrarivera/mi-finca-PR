import { useAuthStore } from '@/store/useAuthStore'
import { toast } from '@/store/useToastStore'

// Default: the API lives on the same host the page was loaded from. That
// makes LAN dev work with zero config — a phone loading the app from
// http://192.168.x.x:5173 talks to the API on that same IP, while desktop
// localhost stays localhost (keeping the sameSite:'strict' refresh cookie
// first-party in both cases). VITE_API_URL still overrides for production.
export const API_URL =
  import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`

type ApiResponse<T> = {
  success: true
  data: T
}

type ApiError = {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

type ApiResult<T> = ApiResponse<T> | ApiError

class ApiClient {
  private baseUrl: string
  // Single-flight refresh: concurrent 401s share one round-trip.
  private refreshing: Promise<boolean> | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  // Access tokens live 15 minutes by design; the 30-day cookie exists so
  // this client can renew them silently. Returns true when a new access
  // token was stored.
  private tryRefresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok || !json.success) return false
        useAuthStore.getState().setAuth(json.data.accessToken, json.data.user)
        return true
      } catch {
        return false
      }
    })().finally(() => { this.refreshing = null })
    return this.refreshing
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const doFetch = () => fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.getHeaders(),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    })

    let res = await doFetch()

    // Expired access token mid-session: refresh and retry ONCE. The auth
    // endpoints are exempt — a 401 there is the actual answer, and the
    // refresh call itself must never recurse.
    if (res.status === 401 && !path.startsWith('/api/v1/auth/')) {
      if (await this.tryRefresh()) {
        res = await doFetch()
      } else {
        // Refresh cookie gone/expired — surface the logged-out state
        // instead of erroring forever behind a stale token.
        useAuthStore.getState().clearAuth()
      }
    }

    return this.handleResponse<T>(res)
  }

  private getHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    }

    const token = useAuthStore.getState().accessToken
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return headers
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const json: ApiResult<T> = await res.json()

    if (!json.success) {
      const message = json.error.message || 'An error occurred'
      toast.error(message)
      throw new Error(message)
    }

    return json.data
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body)
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }
}

export const api = new ApiClient(API_URL)