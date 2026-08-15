import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'

type User = {
  id: string
  email: string
  fullName: string
  language: string
  unitSystem: string
  emailVerified: boolean
}

type AuthResponse = {
  accessToken: string
  user: User
}

// ── Silent refresh on app load ────────────────────────────────────────
export function useInitAuth() {
  const { setAuth } = useAuthStore()

  return useQuery({
    queryKey: ['auth', 'refresh'],
    queryFn: async () => {
      try {
        const data = await api.post<AuthResponse>('/api/v1/auth/refresh')
        setAuth(data.accessToken, data.user)
        return data
      } catch {
        // No valid refresh token — user needs to log in
        return null
      }
    },
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

// ── Login ─────────────────────────────────────────────────────────────
export function useLogin() {
  const { setAuth } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      return api.post<AuthResponse>('/api/v1/auth/login', credentials)
    },
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user)
      queryClient.invalidateQueries({ queryKey: ['farms'] })
      navigate('/');
    },
  })
}

// ── Register ──────────────────────────────────────────────────────────
export function useRegister() {
  const { setAuth } = useAuthStore()

  return useMutation({
    mutationFn: async (data: {
      email: string
      password: string
      fullName: string
      /** Required while the signup gate (SIGNUP_MODE=invite) is up. */
      accessCode?: string
    }) => {
      return api.post<AuthResponse & { accessKind: 'signup' | 'farmInvite' | null }>(
        '/api/v1/auth/register', data
      )
    },
    // Navigation after signup belongs to RegisterPage (it may join a farm
    // by invite code first, then goes to '/'). A stray navigate('/login')
    // here used to yank every new user back to the login screen 2.5s
    // after they were already inside the app.
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user)
    },
  })
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
      queryClient.clear()
      navigate('/login')
    },
    onError: () => {
      // Clear auth even if logout API fails
      clearAuth()
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