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

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
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
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',  // send cookies
    })
    return this.handleResponse<T>(res)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    })
    return this.handleResponse<T>(res)
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    })
    return this.handleResponse<T>(res)
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    })
    return this.handleResponse<T>(res)
  }

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      credentials: 'include',
    })
    return this.handleResponse<T>(res)
  }
}

export const api = new ApiClient(API_URL)