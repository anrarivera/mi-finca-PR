import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useInitAuth } from '@/features/auth/hooks/useAuth'

type Props = {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: Props) {
  const { isAuthenticated } = useAuthStore()
  const { isLoading } = useInitAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f5f8f0]">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">🌱</span>
          <div className="w-6 h-6 rounded-full border-2 border-[#639922] border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}