import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

type AuthMode = 'login' | 'register'

export const Route = createFileRoute('/auth')({
  component: AuthPage,
})

function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')

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
            onSubmit={(event) => {
              event.preventDefault()
            }}
          >
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
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
