import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

type AuthMode = 'login' | 'register'

export const Route = createFileRoute('/auth')({
  component: AuthPage,
})

function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const { login, register } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const isLogin = mode === 'login'

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-icon">⬡</span>
          <div>
            <div className="brand-name">TodoTree</div>
            <div className="brand-sub">
              Infinite hierarchy · Focused execution
            </div>
          </div>
        </div>
        <div className="tabs">
          <button
            type="button"
            className={`tab${isLogin ? ' active' : ''}`}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={`tab${!isLogin ? ' active' : ''}`}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>
      </header>

      <main className="main px-4 py-5 sm:px-5 sm:py-6">
        <section className="suggestions auth-shell rise-in">
          <div className="suggestions-head">
            <div>
              <div className="suggestions-kicker">
                {isLogin ? 'Welcome back' : 'Create account'}
              </div>
            </div>
            <div className="suggestions-note">
              {isLogin
                ? 'Sign in with your account credentials.'
                : 'Create an account to save your own private tree.'}
            </div>
          </div>

          <form
            className="suggestion-hide-menu auth-form"
            onSubmit={async (event) => {
              event.preventDefault()

              const formData = new FormData(event.currentTarget)
              const email = String(formData.get('email') ?? '').trim()
              const password = String(formData.get('password') ?? '')
              const confirmPassword = String(
                formData.get('confirmPassword') ?? '',
              )
              const username = String(formData.get('username') ?? '').trim()

              if (!email || !password) {
                setError('Email and password are required.')
                return
              }

              if (!isLogin && password !== confirmPassword) {
                setError('Passwords do not match.')
                return
              }

              setIsSubmitting(true)
              setError(null)

              try {
                if (isLogin) {
                  await login({ identifier: email, password })
                } else {
                  await register({
                    username: username || email.split('@')[0],
                    email,
                    password,
                  })
                }

                await navigate({ to: '/' })
              } catch (authError) {
                setError(
                  authError instanceof Error
                    ? authError.message
                    : 'Unable to sign in.',
                )
              }
            }}
          >
            {!isLogin ? (
              <label className="suggestion-hide-row flex-col gap-1">
                <span className="suggestion-title">Username</span>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  className="suggestion-hide-input auth-input"
                />
              </label>
            ) : null}

            <label className="suggestion-hide-row flex-col gap-1">
              <span className="suggestion-title">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                className="suggestion-hide-input auth-input"
              />
            </label>

            <label className="suggestion-hide-row flex-col gap-1">
              <span className="suggestion-title">Password</span>
              <input
                type="password"
                name="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                className="suggestion-hide-input auth-input"
              />
            </label>

            {!isLogin ? (
              <label className="suggestion-hide-row flex-col gap-1">
                <span className="suggestion-title">Confirm password</span>
                <input
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  className="suggestion-hide-input auth-input"
                />
              </label>
            ) : null}

            <button type="submit" className="btn-start mt-1">
              {isLogin ? 'Login' : 'Register'}
            {error ? (
              <div className="suggestions-note text-(--danger)">{error}</div>
            ) : null}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
