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

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      return api.post<AuthResponse>('/api/v1/auth/login', credentials)
    },
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user)
      queryClient.invalidateQueries({ queryKey: ['farms'] })
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
    }) => {
      return api.post<AuthResponse>('/api/v1/auth/register', data)
    },
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
      return api.post('/api/v1/auth/reset-password', data)
    },
  })
}