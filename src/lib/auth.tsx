import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken, type User } from './api'
import { dropPushOnSignOut, syncPush } from './push'

type AuthCtx = {
  user: User | null
  ready: boolean
  login: (identifier: string, password: string) => Promise<User>
  register: (data: { name: string; email: string; phone: string; password: string; country: string; county: string; ward: string; email_token?: string; phone_token?: string; accept_terms?: boolean; terms_version?: string }) => Promise<User>
  loginWithGoogle: (idToken: string, opts?: { accept_terms?: boolean; terms_version?: string; country?: string; county?: string; ward?: string }) => Promise<{ user: User; created: boolean }>
  logout: () => Promise<void>
  refresh: () => Promise<User | null>
  setUser: (u: User | null) => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setReady(true)
      return null
    }
    try {
      const u = await api.get<User>('/auth/me')
      setUser(u)
      return u
    } catch {
      setToken(null)
      setUser(null)
      return null
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (identifier: string, password: string) => {
    const r = await api.post<{ token: string; user: User }>('/auth/login', { identifier, password })
    setToken(r.token)
    setUser(r.user)
    window.dispatchEvent(new Event('uko:auth'))
    return r.user
  }, [])

  const register = useCallback(async (data: { name: string; email: string; phone: string; password: string; country: string; county: string; ward: string; email_token?: string; phone_token?: string; accept_terms?: boolean; terms_version?: string }) => {
    const r = await api.post<{ token: string; user: User }>('/auth/register', data)
    setToken(r.token)
    setUser(r.user)
    window.dispatchEvent(new Event('uko:auth'))
    return r.user
  }, [])

  const loginWithGoogle = useCallback(async (idToken: string, opts: { accept_terms?: boolean; terms_version?: string; country?: string; county?: string; ward?: string } = {}) => {
    const r = await api.post<{ token: string; user: User; created: boolean }>('/auth/google', { id_token: idToken, ...opts })
    setToken(r.token)
    setUser(r.user)
    window.dispatchEvent(new Event('uko:auth'))
    return { user: r.user, created: r.created }
  }, [])

  // Web push follows the signed-in account: re-save this browser's subscription on sign-in, drop it on sign-out.
  const userId = user?.id
  useEffect(() => {
    if (userId) syncPush().catch(() => {})
  }, [userId])

  const logout = useCallback(async () => {
    await dropPushOnSignOut()
    try {
      await api.post('/auth/logout')
    } catch {}
    setToken(null)
    setUser(null)
    window.dispatchEvent(new Event('uko:auth'))
  }, [])

  const value = useMemo(() => ({ user, ready, login, register, loginWithGoogle, logout, refresh, setUser }), [user, ready, login, register, loginWithGoogle, logout, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
