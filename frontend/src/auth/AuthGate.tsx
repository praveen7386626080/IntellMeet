
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import AuthPage from './AuthPage'
import ResetPasswordPage from './ResetPasswordPage'

export default function AuthGate({
  children,
}: {
  children: ReactNode
}) {
  const { user, loading, completeOAuth } = useAuth()

  const [callbackError, setCallbackError] = useState('')
  const [callbackProcessing, setCallbackProcessing] = useState(false)

  const callbackStarted = useRef(false)

  const currentPath = window.location.pathname.replace(/\/+$/, '')
  const isOAuthCallback = currentPath === '/auth/callback'

  useEffect(() => {
    if (!isOAuthCallback || callbackStarted.current) {
      return
    }

    callbackStarted.current = true

    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get('oauthError')
    const oauthToken = new URLSearchParams(
      window.location.hash.replace(/^#/, ''),
    ).get('token')

    // Remove OAuth credentials and errors from the browser URL.
    window.history.replaceState(
      {},
      document.title,
      '/',
    )

    if (oauthError) {
      setCallbackError(oauthError)
      return
    }
if (!oauthToken) {
  setCallbackError(
    'No authentication token was received. Please try again.',
  )
  return
}

// Store the validated token as a string.
const token = oauthToken

let active = true

    async function finishOAuthLogin() {
      try {
        setCallbackProcessing(true)
        await completeOAuth(token)

      } catch (error) {
        if (active) {
          setCallbackError(
            error instanceof Error
              ? error.message
              : 'Social login failed. Please try again.',
          )
        }
      } finally {
        if (active) {
          setCallbackProcessing(false)
        }
      }
    }

    void finishOAuthLogin()

    return () => {
      active = false
    }
  }, [isOAuthCallback, completeOAuth])

  // Allow password reset links without requiring login.
  if (currentPath === '/reset-password') {
    return <ResetPasswordPage />
  }

  // Handle Google and GitHub OAuth callbacks.
  if (isOAuthCallback) {
    if (user) {
      return <>{children}</>
    }

    if (callbackError) {
      return (
        <div className="auth-loading">
          <p role="alert">{callbackError}</p>
          <button
            type="button"
            onClick={() => {
              window.location.replace('/')
            }}
          >
            Back to Sign In
          </button>
        </div>
      )
    }

    return (
      <div className="auth-loading">
        {callbackProcessing
          ? 'Completing social login...'
          : 'Connecting your account...'}
      </div>
    )
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
