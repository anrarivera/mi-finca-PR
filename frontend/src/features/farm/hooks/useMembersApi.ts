import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { FarmRole } from '@/store/useFarmStore'

export type FarmMember = {
  userId: string
  fullName: string
  email: string
  role: FarmRole
}

export function useMembers(farmId: string | null) {
  return useQuery({
    queryKey: ['members', farmId],
    queryFn: () => api.get<FarmMember[]>(`/api/v1/farms/${farmId}/members`),
    enabled: !!farmId,
  })
}

export function useAddMember(farmId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; role: 'admin' | 'operator' }) =>
      api.post<FarmMember>(`/api/v1/farms/${farmId}/members`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', farmId] }),
  })
}

export function useUpdateMemberRole(farmId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'operator' }) =>
      api.patch(`/api/v1/farms/${farmId}/members/${userId}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', farmId] }),
  })
}

export function useRemoveMember(farmId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/v1/farms/${farmId}/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', farmId] }),
  })
}

// ── Join codes ────────────────────────────────────────────────────────

export type FarmInvite = {
  id: string
  role: 'admin' | 'operator'
  expiresAt: string
  createdAt: string
}

export function useInvites(farmId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['invites', farmId],
    queryFn: () => api.get<FarmInvite[]>(`/api/v1/farms/${farmId}/members/invites`),
    enabled: !!farmId && enabled,
  })
}

export function useCreateInvite(farmId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { role: 'admin' | 'operator' }) =>
      api.post<FarmInvite & { code: string }>(`/api/v1/farms/${farmId}/members/invites`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites', farmId] }),
  })
}

export function useRevokeInvite(farmId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: string) =>
      api.delete(`/api/v1/farms/${farmId}/members/invites/${inviteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites', farmId] }),
  })
}

// Redeem a code — refetches farms so the new membership shows up at once.
export function useJoinFarm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) =>
      api.post<{ farmId: string; farmName: string; role: string }>(
        '/api/v1/farms/join', { code }
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['farms'] }),
  })
}
