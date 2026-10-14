
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import AuthPage from './AuthPage'

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Checking your session...
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px',
          background: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <span style={{ fontSize: 14 }}>
          Signed in as <strong>{user.name}</strong>
        </span>
        <button
          type="button"
          onClick={signOut}
          style={{
            padding: '7px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            background: '#ffffff',
            cursor: 'pointer',
          }}
        >
          Log out
        </button>
      </div>

      {children}
    </>
  )
}
