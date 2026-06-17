import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { User } from '../lib/types'

interface AuthContextValue {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isReady: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string, displayName?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [user, setUser] = useState<User | null>(null)
  const [isReady, setIsReady] = useState(() => !localStorage.getItem('token'))
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    if (!token || isReady) return
    api.auth.me()
      .then(({ user }) => {
        setUser(user)
        setIsAuthenticated(true)
      })
      .catch(() => {
        localStorage.removeItem('token')
        setToken(null)
      })
      .finally(() => setIsReady(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    const { token: newToken } = await api.auth.login({ email, password })
    localStorage.setItem('token', newToken)
    setToken(newToken)
    const { user: me } = await api.auth.me()
    setUser(me)
    setIsAuthenticated(true)
  }, [])

  const register = useCallback(async (email: string, username: string, password: string, displayName?: string) => {
    const { token: newToken } = await api.auth.register({
      email,
      username,
      password,
      display_name: displayName,
    })
    localStorage.setItem('token', newToken)
    setToken(newToken)
    const { user: me } = await api.auth.me()
    setUser(me)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated, isReady, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
