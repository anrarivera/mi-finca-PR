import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, bindAuthHandlers, refreshSession } from '@/lib/api'

// ──────────────────────────────────────────────────────────────────────────
// Auth session state. The app is fully usable as a guest (offline-first,
// localStorage); logging in connects the account on the backend.
//
// Security model: only the user profile is persisted. The access token is
// kept in memory and re-obtained on page load via the refresh cookie.
// ──────────────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string
  email: string
  fullName: string
  language: string
  unitSystem: string
  emailVerified: boolean
}

type AuthStatus = 'guest' | 'restoring' | 'authenticated'

type AuthStore = {
  user: AuthUser | null
  accessToken: string | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<AuthUser>
  register: (fullName: string, email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  restoreSession: () => Promise<void>
}

type AuthResponse = { accessToken: string; user: AuthUser }

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      status: 'guest',

      login: async (email, password) => {
        const data = await api<AuthResponse>('/api/v1/auth/login', {
          method: 'POST',
          body: { email, password },
          anonymous: true,
        })
        set({ user: data.user, accessToken: data.accessToken, status: 'authenticated' })
        return data.user
      },

      register: async (fullName, email, password) => {
        const data = await api<AuthResponse>('/api/v1/auth/register', {
          method: 'POST',
          body: { fullName, email, password },
          anonymous: true,
        })
        set({ user: data.user, accessToken: data.accessToken, status: 'authenticated' })
        return data.user
      },

      logout: async () => {
        try {
          await api('/api/v1/auth/logout', { method: 'POST', anonymous: true })
        } catch {
          // Offline logout is fine — the refresh cookie stays scoped to the
          // API and the local session is cleared regardless.
        }
        set({ user: null, accessToken: null, status: 'guest' })
      },

      // On app load: if a user was persisted, try to silently renew the
      // session with the refresh cookie. Only a definitive rejection ends
      // the session — if the backend is simply unreachable, the user stays
      // signed in and the next API call retries the refresh.
      restoreSession: async () => {
        if (!get().user) return
        set({ status: 'restoring' })
        const result = await refreshSession()
        if (result.ok) {
          set({ accessToken: result.token, status: 'authenticated' })
        } else if (result.reason === 'unauthorized') {
          set({ user: null, accessToken: null, status: 'guest' })
        } else {
          set({ status: 'authenticated' })
        }
      },
    }),
    {
      name: 'mi-finca-auth',
      // Never persist the access token.
      partialize: (state) => ({ user: state.user }),
    }
  )
)

bindAuthHandlers({
  getAccessToken: () => useAuthStore.getState().accessToken,
  setAccessToken: (token) => useAuthStore.setState({ accessToken: token }),
  onSessionExpired: () =>
    useAuthStore.setState({ user: null, accessToken: null, status: 'guest' }),
})
