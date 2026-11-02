
import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'
import './Auth.css'

export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [localError, setLocalError] = useState('')

  const { resetPassword, error, clearError } = useAuth()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')
    setSuccessMessage('')
    clearError()

    if (!token || !/^[a-fA-F0-9]{64}$/.test(token)) {
      setLocalError('This password reset link is invalid.')
      return
    }

    if (password.length < 8 || password.length > 72) {
      setLocalError('Password must contain between 8 and 72 characters.')
      return
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    setSubmitting(true)

    try {
      const message = await resetPassword(token, password)
      setSuccessMessage(message)
      setPassword('')
      setConfirmPassword('')
    } catch {
      // AuthContext displays the backend error.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">IM</div>
          <div>
            <h1>IntellMeet</h1>
            <p>Meet smarter. Work better.</p>
          </div>
        </div>

        <h2>Reset your password</h2>

        <p className="auth-subtitle">
          Enter a new password for your IntellMeet account.
        </p>

        {!token ? (
          <>
            <p className="auth-error" role="alert">
              The reset link is missing its token. Please request a new link.
            </p>
            <button
              type="button"
              className="auth-submit"
              onClick={() => {
                window.location.href = '/'
              }}
            >
              Back to sign in
            </button>
          </>
        ) : successMessage ? (
          <>
            <p className="auth-info-message" role="status">
              {successMessage}
            </p>
            <button
              type="button"
              className="auth-submit"
              onClick={() => {
                window.location.href = '/'
              }}
            >
              Continue to sign in
            </button>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-password-label">
              New password
              <span className="auth-password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  placeholder="Enter new password"
                  required
                />

                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>

            <label>
              Confirm new password
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                placeholder="Confirm new password"
                required
              />
            </label>

            {(localError || error) && (
              <p className="auth-error" role="alert">
                {localError || error}
              </p>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={submitting}
            >
              {submitting ? 'Updating password...' : 'Update password'}
            </button>

            <button
              type="button"
              className="auth-back-link"
              onClick={() => {
                window.location.href = '/'
              }}
            >
              Back to sign in
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
