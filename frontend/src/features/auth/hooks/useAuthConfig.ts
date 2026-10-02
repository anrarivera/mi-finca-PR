import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// The signup gate, as the server reports it (GET /auth/config — public).
// While SIGNUP_MODE=invite creating an account takes an access code, so
// whatever leads to the register page says so, and points whoever has no
// code to /request-access. `gated` is false until the answer is in.
export function useAuthConfig({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => api.get<{ signupMode: 'open' | 'invite' }>('/api/v1/auth/config'),
    staleTime: 5 * 60 * 1000,
    enabled,
  })

  return { gated: data?.signupMode === 'invite', isLoading }
}
