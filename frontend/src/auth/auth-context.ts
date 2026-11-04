import { createContext } from 'react'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: string
}

export type AuthContextValue = {
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

export const AuthContext =
  createContext<AuthContextValue | undefined>(
  undefined,
)
