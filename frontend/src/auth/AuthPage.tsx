
import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'
import './Auth.css'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showForgotPanel, setShowForgotPanel] = useState(false)
  const [socialMessage, setSocialMessage] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light',
  )

  const { signIn, signUp, error, clearError } = useAuth()

  function toggleTheme() {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    localStorage.setItem('intellmeet-theme', nextTheme)
  }

  function switchMode(nextMode: 'login' | 'register') {
    setMode(nextMode)
    setName('')
    setEmail('')
    setPassword('')
    setShowPassword(false)
    setShowForgotPanel(false)
    setSocialMessage('')
    clearError()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    clearError()

    try {
      if (mode === 'register') {
        await signUp(name.trim(), email.trim(), password)
      } else {
        await signIn(email.trim(), password)
      }
    } catch {
      // AuthContext displays the server error.
    } finally {
      setSubmitting(false)
    }
  }

  function handleSocialLogin(provider: 'Google' | 'GitHub') {
    setSocialMessage(
      `${provider} sign-in will be available after backend OAuth integration.`,
    )
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-top-actions">
          <button
            type="button"
            className="auth-theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <span aria-hidden="true">
              {theme === 'light' ? '☾' : '☀'}
            </span>
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>

        <div className="auth-brand">
          <div className="auth-logo">IM</div>
          <div>
            <h1>IntellMeet</h1>
            <p>Meet smarter. Work better.</p>
          </div>
        </div>

        <h2>
          {mode === 'login'
            ? 'Welcome back'
            : 'Create your account'}
        </h2>

        <p className="auth-subtitle">
          {mode === 'login'
            ? 'Sign in to continue to your workspace.'
            : 'Join your team on IntellMeet.'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>

          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        {mode === 'login' && (
          <>
            <div className="auth-social-buttons">
              <button
                type="button"
                className="auth-social-button"
                onClick={() => handleSocialLogin('Google')}
              >
                <span className="social-google" aria-hidden="true">G</span>
                Continue with Google
              </button>

              <button
                type="button"
                className="auth-social-button"
                onClick={() => handleSocialLogin('GitHub')}
              >
                <span className="social-github" aria-hidden="true">⌘</span>
                Continue with GitHub
              </button>
            </div>

            {socialMessage && (
              <p className="auth-info-message" role="status">
                {socialMessage}
              </p>
            )}

            <div className="auth-divider">
              <span>or continue with email</span>
            </div>
          </>
        )}

        {showForgotPanel && mode === 'login' ? (
          <div className="auth-forgot-panel">
            <h3>Forgot your password?</h3>
            <p>
              Password reset will be enabled after the backend reset API
              is integrated.
            </p>

            <label htmlFor="forgot-email">Email address</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />

            <button
              type="button"
              className="auth-submit"
              disabled
              title="Waiting for backend integration"
            >
              Send reset link
            </button>

            <button
              type="button"
              className="auth-back-link"
              onClick={() => setShowForgotPanel(false)}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <label>
                Full name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                  placeholder="Enter your full name"
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
                placeholder="you@example.com"
              />
            </label>

            <label className="auth-password-label">
              Password
              <span className="auth-password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={
                    mode === 'login'
                      ? 'current-password'
                      : 'new-password'
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={72}
                  required
                  placeholder="At least 8 characters"
                />

                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>

            {mode === 'login' && (
              <div className="auth-forgot-row">
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() => {
                    setShowForgotPanel(true)
                    setSocialMessage('')
                    clearError()
                  }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="auth-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  Please wait...
                </>
              ) : mode === 'login' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </button>
          </form>
        )}

        <p className="auth-switch">
          {mode === 'login'
            ? "Don't have an account?"
            : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() =>
              switchMode(mode === 'login' ? 'register' : 'login')
            }
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  )
}
