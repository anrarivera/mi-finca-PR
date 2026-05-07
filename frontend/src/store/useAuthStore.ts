import { create } from 'zustand'

type User = {
  id: string
  email: string
  fullName: string
  language: string
  unitSystem: string
  emailVerified: boolean
}

type AuthStore = {
  accessToken: string | null
  user: User | null
  isAuthenticated: boolean
  setAuth: (accessToken: string, user: User) => void
  clearAuth: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,

  setAuth: (accessToken, user) =>
    set({ accessToken, user, isAuthenticated: true }),

  clearAuth: () =>
    set({ accessToken: null, user: null, isAuthenticated: false }),

  setUser: (user) =>
    set({ user }),
}))