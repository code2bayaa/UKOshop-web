/**
 * Unread notification count + list, shared by the bell badges (nav, mobile top bar) and the
 * /notifications page — opening or marking one read drops the badge everywhere straight away,
 * without waiting for a refetch. Same shape as CartProvider: loads on mount, on `uko:auth` and
 * every 30 s (see poll.ts), so a notification that lands while he is on another page still shows up.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, getToken, type Notification } from './api'
import { usePolledRefresh } from './poll'

type Feed = { unread: number; items: Notification[] }

const EMPTY: Feed = { unread: 0, items: [] }

type NotificationsCtx = {
  unread: number
  items: Notification[]
  loaded: boolean
  refresh: () => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
}

const Ctx = createContext<NotificationsCtx | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [feed, setFeed] = useState<Feed>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const feedRef = useRef(feed)
  feedRef.current = feed
  /** When we last marked something read here — a poll that left before that is already out of date. */
  const markedAt = useRef(0)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setFeed(EMPTY)
      setLoaded(true)
      return
    }
    const startedAt = Date.now()
    try {
      const fresh = await api.get<Feed>('/notifications')
      if (markedAt.current <= startedAt) setFeed(fresh)  // else: it would put a read row back
    } catch {
      // signed out or offline — leave the badge as it is
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    refresh()
    const h = () => refresh()
    window.addEventListener('uko:auth', h)
    return () => window.removeEventListener('uko:auth', h)
  }, [refresh])

  usePolledRefresh(refresh)

  /** Optimistic: flip the row and take one off the badge, then tell the API. */
  const markRead = useCallback(async (id: number) => {
    const row = feedRef.current.items.find((x) => x.id === id)
    if (row?.is_read) return
    markedAt.current = Date.now()
    setFeed((f) => ({
      unread: Math.max(0, f.unread - 1),
      items: f.items.map((x) => (x.id === id ? { ...x, is_read: true } : x)),
    }))
    try {
      await api.post(`/notifications/read?id=${id}`)
    } catch {
      refresh()
    }
  }, [refresh])

  const markAllRead = useCallback(async () => {
    markedAt.current = Date.now()
    setFeed((f) => ({ unread: 0, items: f.items.map((n) => ({ ...n, is_read: true })) }))
    try {
      await api.post('/notifications/read')
    } catch (e) {
      refresh()  // put the badge back to whatever the API still says is unread
      throw e
    }
  }, [refresh])

  const value = useMemo(
    () => ({ unread: feed.unread, items: feed.items, loaded, refresh, markRead, markAllRead }),
    [feed, loaded, refresh, markRead, markAllRead],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNotifications(): NotificationsCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useNotifications outside NotificationsProvider')
  return v
}

/** 99+ keeps the badge round — counts that big only happen on a long-idle account. */
export const badgeCount = (n: number): string => (n > 99 ? '99+' : String(n))
