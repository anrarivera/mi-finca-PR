import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'
import { clearAccountData, wipeAccount } from '@/store/farmActions'

type User = {
  id: string
  email: string
  fullName: string
  language: string
  unitSystem: string
  emailVerified: boolean
  /** Ephemeral try-before-signup account ("Probar la demo"). */
  isDemo?: boolean
}

type AuthResponse = {
  accessToken: string
  user: User
}

// ── Silent refresh on app load ────────────────────────────────────────
// Uses api.refreshSession() (not api.post) so a missing/expired cookie
// answers quietly — the toasting client turned every logged-out visit
// (and the post-logout refetch) into an "Unauthorized" error alert.
export function useInitAuth() {
  return useQuery({
    queryKey: ['auth', 'refresh'],
    // refreshSession() stores the token itself; no valid cookie → false.
    queryFn: () => api.refreshSession(),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

// ── Starting a session ────────────────────────────────────────────────
// Every way in — login, register, demo — stores its session through
// here, and starts from a clean slate. Logout wipes on the way out, but a
// session also ends by expiring (lib/api), with the account's deletion or
// with an email change, and those clear the auth state and nothing else:
// the next account to sign in on this browser would find the previous
// one's farm on the map and its labores behind the bell.
function useStartSession() {
  const { setAuth } = useAuthStore()
  const queryClient = useQueryClient()

  return (session: AuthResponse) => {
    wipeAccount(queryClient)
    setAuth(session.accessToken, session.user)
  }
}

// ── Login ─────────────────────────────────────────────────────────────
export function useLogin() {
  const startSession = useStartSession()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      return api.post<AuthResponse>('/api/v1/auth/login', credentials)
    },
    onSuccess: (data) => {
      startSession(data)
      navigate('/');
    },
  })
}

// ── Register ──────────────────────────────────────────────────────────
export function useRegister() {
  const startSession = useStartSession()

  return useMutation({
    mutationFn: async (data: {
      email: string
      password: string
      fullName: string
      /** Required while the signup gate (SIGNUP_MODE=invite) is up. */
      accessCode?: string
    }) => {
      return api.post<AuthResponse & {
        accessKind: 'signup' | 'farmInvite' | null
        /** Set when a farm-invite access code already joined its farm. */
        joinedFarm: { farmId: string; farmName: string; role: string } | null
      }>(
        '/api/v1/auth/register', data
      )
    },
    // Navigation after signup belongs to RegisterPage (it may join a farm
    // by invite code first, then goes to '/'). A stray navigate('/login')
    // here used to yank every new user back to the login screen 2.5s
    // after they were already inside the app.
    onSuccess: (data) => {
      startSession(data)
    },
  })
}

// ── Request access ────────────────────────────────────────────────────
// For whoever has no access code while the signup gate is up. The server
// stores the request, tells the app's owner, and answers every request
// the same way — whether or not it already knew the address.
export function useRequestAccess() {
  return useMutation({
    mutationFn: async (data: {
      fullName: string
      email: string
      location?: string
      message?: string
      language: 'es' | 'en'
    }) => {
      return api.post<{ received: boolean }>('/api/v1/auth/access-requests', data)
    },
  })
}

// ── Demo mode ─────────────────────────────────────────────────────────
// "Probar la demo": the server creates an ephemeral account seeded with a
// sample farm and signs the visitor straight in.
export function useDemoLogin() {
  const startSession = useStartSession()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async () => {
      return api.post<AuthResponse>('/api/v1/auth/demo')
    },
    onSuccess: (data) => {
      startSession(data)
      navigate('/')
    },
  })
}

// ── Leaving the demo ──────────────────────────────────────────────────
// The demo banner's way out, to a public page. The demo session ends like
// a logout — closed on the server, wiped from this browser — but only
// once that page is on screen, which is when the banner unmounts. Ending
// it on the click made ProtectedRoute redirect to /login, and its
// redirect landed after the banner's own: "Crear mi cuenta" opened the
// login page.
export function useLeaveDemo() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const leaving = useRef(false)

  useEffect(() => {
    return () => {
      if (!leaving.current) return
      // Best effort — the visitor has moved on, and an unreachable server
      // leaves nothing worse than a demo session that expires on its own.
      api.post('/api/v1/auth/logout').catch(() => {})
      useAuthStore.getState().clearAuth()
      wipeAccount(queryClient)
    }
  }, [queryClient])

  return (to: string) => {
    leaving.current = true
    navigate(to)
  }
}

// ── Logout ────────────────────────────────────────────────────────────
export function useLogout() {
  const { clearAuth } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async () => {
      return api.post('/api/v1/auth/logout')
    },
    onSuccess: () => {
      clearAuth()
      clearAccountData()
      queryClient.clear()
      navigate('/login')
    },
    onError: () => {
      // Clear auth even if logout API fails
      clearAuth()
      clearAccountData()
      queryClient.clear()
      navigate('/login')
    },
  })
}

// ── Forgot password ───────────────────────────────────────────────────
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (data: { email: string }) => {
      return api.post('/api/v1/auth/forgot-password', data)
    },
  })
}

// ── Reset password ────────────────────────────────────────────────────
export function useResetPassword() {
  return useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      // Backend schema expects `newPassword` (routes/auth.ts) — the page
      // keeps the friendlier `password` name in its own props.
      return api.post('/api/v1/auth/reset-password', {
        token: data.token,
        newPassword: data.password,
      })
    },
  })
}

// ── Verify email (landing page for the emailed link) ──────────────────
// Redeems the single-use token from /verify-email?token=… against
// POST /auth/verify-email/confirm.
export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (data: { token: string }) => {
      return api.post<{ message: string }>('/api/v1/auth/verify-email/confirm', data)
    },
  })
}

// ── Request a (re)send of the verification email ──────────────────────
export function useRequestVerifyEmail() {
  return useMutation({
    mutationFn: async () => {
      return api.post<{ message: string }>('/api/v1/auth/verify-email/request')
    },
  })
}

// ── Confirm email change (landing page for the emailed link) ──────────
// Redeems the token from /change-email?token=…. On success the backend
// revokes all sessions, so the page sends the user back to login.
export function useConfirmChangeEmail() {
  return useMutation({
    mutationFn: async (data: { token: string }) => {
      return api.post<{ message: string; email: string }>(
        '/api/v1/auth/change-email/confirm',
        data
      )
    },
  })
}