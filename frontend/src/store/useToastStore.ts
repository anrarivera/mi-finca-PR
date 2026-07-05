import { create } from 'zustand'

// ──────────────────────────────────────────────────────────────────────────
// Global toast queue. Any component (or plain function) can fire a toast via
// the `toast` helpers below; <ToastContainer/> in the app layout renders the
// queue. Unlike the previous per-page toast state, several toasts can stack
// and pages don't each need their own <Toast/> plumbing.
// ──────────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info'

export type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
  duration: number
}

type ToastStore = {
  toasts: ToastItem[]
  push: (message: string, variant?: ToastVariant, duration?: number) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],

  push: (message, variant = 'success', duration = 3000) =>
    set(state => ({
      toasts: [...state.toasts, { id: nextId++, message, variant, duration }],
    })),

  dismiss: (id) =>
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}))

// Convenience API usable outside React components too.
export const toast = {
  success: (message: string) => useToastStore.getState().push(message, 'success'),
  error: (message: string) => useToastStore.getState().push(message, 'error', 5000),
  info: (message: string) => useToastStore.getState().push(message, 'info'),
}
