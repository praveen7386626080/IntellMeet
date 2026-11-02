
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import AuthPage from './AuthPage'
import ResetPasswordPage from './ResetPasswordPage'

export default function AuthGate({
  children,
}: {
  children: ReactNode
}) {
  const { user, loading } = useAuth()

  const currentPath = window.location.pathname.replace(/\/+$/, '')

  // Allow password reset links without requiring login.
  if (currentPath === '/reset-password') {
    return <ResetPasswordPage />
  }

  if (loading) {
    return (
      <div className="auth-loading">
        Checking your session...
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return <>{children}</>
}
