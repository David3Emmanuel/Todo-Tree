import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const AUTH_STORAGE_KEY = 'todo-tree-auth'
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:1337'

export type AuthUser = {
  id: number
  username: string
  email: string
}

type LoginInput = {
  identifier: string
  password: string
}

type RegisterInput = {
  username: string
  email: string
  password: string
}

type AuthContextValue = {
  user: AuthUser | null
  jwt: string | null
  isHydrating: boolean
  isAuthenticated: boolean
  login: (input: LoginInput) => Promise<AuthUser>
  register: (input: RegisterInput) => Promise<AuthUser>
  logout: () => void
  refreshUser: () => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type AuthResponse = {
  jwt: string
  user: AuthUser
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseUser(value: unknown): AuthUser | null {
  if (!isObject(value)) {
    return null
  }

  const id = Number(value.id)
  const username = typeof value.username === 'string' ? value.username : ''
  const email = typeof value.email === 'string' ? value.email : ''

  if (!Number.isFinite(id) || !username || !email) {
    return null
  }

  return { id, username, email }
}

function readStoredJwt(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { jwt?: unknown }
    return typeof parsed.jwt === 'string' && parsed.jwt.length > 0
      ? parsed.jwt
      : null
  } catch {
    return null
  }
}

function storeJwt(jwt: string | null): void {
  if (typeof window === 'undefined') {
    return
  }

  if (!jwt) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ jwt }))
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

function readErrorMessage(payload: unknown): string {
  if (!isObject(payload)) {
    return 'Authentication request failed.'
  }

  const error = payload.error
  if (isObject(error) && typeof error.message === 'string') {
    return error.message
  }

  if (typeof payload.message === 'string') {
    return payload.message
  }

  return 'Authentication request failed.'
}

async function postAuth(path: string, body: object): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(readErrorMessage(payload))
  }

  if (!isObject(payload) || typeof payload.jwt !== 'string') {
    throw new Error('Invalid authentication response payload.')
  }

  const user = parseUser(payload.user)
  if (!user) {
    throw new Error('Invalid user payload from authentication response.')
  }

  return { jwt: payload.jwt, user }
}

async function fetchCurrentUser(jwt: string): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE_URL}/api/users/me`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  })

  if (response.status === 401 || response.status === 403) {
    return null
  }

  const payload = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(readErrorMessage(payload))
  }

  const user = parseUser(payload)
  if (!user) {
    throw new Error('Invalid user payload from current-user response.')
  }

  return user
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [jwt, setJwt] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isHydrating, setIsHydrating] = useState(true)

  useEffect(() => {
    let cancelled = false

    const hydrate = async () => {
      const storedJwt = readStoredJwt()

      if (!storedJwt) {
        if (!cancelled) {
          setIsHydrating(false)
        }
        return
      }

      try {
        const currentUser = await fetchCurrentUser(storedJwt)
        if (cancelled) {
          return
        }

        if (!currentUser) {
          storeJwt(null)
          setJwt(null)
          setUser(null)
        } else {
          setJwt(storedJwt)
          setUser(currentUser)
        }
      } catch {
        if (!cancelled) {
          storeJwt(null)
          setJwt(null)
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false)
        }
      }
    }

    void hydrate()

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (input: LoginInput) => {
    const response = await postAuth('/api/auth/local', input)
    setJwt(response.jwt)
    setUser(response.user)
    storeJwt(response.jwt)
    return response.user
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const response = await postAuth('/api/auth/local/register', input)
    setJwt(response.jwt)
    setUser(response.user)
    storeJwt(response.jwt)
    return response.user
  }, [])

  const logout = useCallback(() => {
    setJwt(null)
    setUser(null)
    storeJwt(null)
  }, [])

  const refreshUser = useCallback(async () => {
    if (!jwt) {
      setUser(null)
      return null
    }

    const currentUser = await fetchCurrentUser(jwt)
    if (!currentUser) {
      setJwt(null)
      setUser(null)
      storeJwt(null)
      return null
    }

    setUser(currentUser)
    return currentUser
  }, [jwt])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      jwt,
      isHydrating,
      isAuthenticated: Boolean(jwt && user),
      login,
      register,
      logout,
      refreshUser,
    }),
    [isHydrating, jwt, login, logout, refreshUser, register, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }

  return context
}
