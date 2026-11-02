
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

const API_URL = `${
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
}/auth`

export type AuthUser = {
  id: string
  name: string
  email: string
  role: string
}

type AuthResponse = {
  message?: string
  user: AuthUser
  token?: string
}

type MessageResponse = {
  message?: string
}

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  loading: boolean
  error: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<void>
  forgotPassword: (email: string) => Promise<string>
  resetPassword: (
    token: string,
    password: string,
  ) => Promise<string>
  signOut: () => void
  clearError: () => void
}

const TOKEN_KEY = 'intellmeet-access-token'

const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string }

    return (
      body.message ||
      'Something went wrong. Please try again.'
    )
  } catch {
    return 'Something went wrong. Please try again.'
  }
}

export function AuthProvider({
  children,
}: {
  children: ReactNode
}) {
  const [user, setUser] = useState<AuthUser | null>(null)

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Sign out without affecting other application features.
  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setError('')
  }, [])

  // Restore the existing login session.
  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_URL}/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error(
            'Your session has expired. Please log in again.',
          )
        }

        const body = (await response.json()) as {
          user: AuthUser
        }

        if (!cancelled) {
          setUser(body.user)
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void restoreSession()

    return () => {
      cancelled = true
    }
  }, [token])

  // Shared login and registration logic.
  const authenticate = useCallback(
    async (
      endpoint: 'login' | 'register',
      payload: object,
    ) => {
      setError('')

      const response = await fetch(
        `${API_URL}/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      )

      if (!response.ok) {
        throw new Error(await readError(response))
      }

      const body = (await response.json()) as AuthResponse

      if (!body.token || !body.user) {
        throw new Error(
          'The server returned an invalid login response.',
        )
      }

      localStorage.setItem(TOKEN_KEY, body.token)
      setUser(body.user)
      setToken(body.token)
    },
    [],
  )

  // Login.
  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        await authenticate('login', {
          email,
          password,
        })
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Login failed.'

        setError(message)
        throw err
      }
    },
    [authenticate],
  )

  // Registration.
  const signUp = useCallback(
    async (
      name: string,
      email: string,
      password: string,
    ) => {
      try {
        await authenticate('register', {
          name,
          email,
          password,
        })
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Registration failed.'

        setError(message)
        throw err
      }
    },
    [authenticate],
  )

  // Request a password reset email.
  const forgotPassword = useCallback(
    async (email: string): Promise<string> => {
      setError('')

      try {
        const response = await fetch(
          `${API_URL}/forgot-password`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: email.trim(),
            }),
          },
        )

        if (!response.ok) {
          throw new Error(await readError(response))
        }

        const body =
          (await response.json()) as MessageResponse

        return (
          body.message ||
          'If an account exists for this email, a reset link has been sent.'
        )
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to send the reset email.'

        setError(message)
        throw err
      }
    },
    [],
  )

  // Submit the new password using the reset token.
  const resetPassword = useCallback(
    async (
      resetToken: string,
      password: string,
    ): Promise<string> => {
      setError('')

      try {
        const response = await fetch(
          `${API_URL}/reset-password`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              token: resetToken,
              password,
            }),
          },
        )

        if (!response.ok) {
          throw new Error(await readError(response))
        }

        const body =
          (await response.json()) as MessageResponse

        return (
          body.message ||
          'Your password has been reset successfully.'
        )
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to reset your password.'

        setError(message)
        throw err
      }
    },
    [],
  )

  // Clear displayed errors.
  const clearError = useCallback(() => {
    setError('')
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        signIn,
        signUp,
        forgotPassword,
        resetPassword,
        signOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// Custom authentication hook.
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth must be used inside AuthProvider.',
    )
  }

  return context
}
