
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import AuthPage from './AuthPage'

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth()

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

  return (
    <>
      <div className="user-auth-actions">
        <span className="signed-in-text">
          Signed in as <strong>{user.name}</strong>
        </span>

        <button
          type="button"
          onClick={signOut}
          className="logout-button"
        >
          Log out
        </button>
      </div>

      {children}
    </>
  )
}
