/**
 * Unread chat count + conversation list, shared by the Messages badges (nav, mobile top bar) and the
 * /chat pages — opening a thread drops the badge straight away. Twin of NotificationsProvider:
 * loads on mount, on `uko:auth` and every 30 s (see poll.ts).
 *
 * Opening a thread is what marks it read: GET /api/chat/<other id> flips every incoming message in it
 * (and its `?since=` poll flips whatever arrived after), so `markThreadRead` only has to take the same
 * rows off our copy.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, getToken, type Conversation } from './api'
import { usePolledRefresh } from './poll'
import { joinChat, leaveChat, onChat, type ChatToken } from './sockets'

type MessagesCtx = {
  unread: number
  conversations: Conversation[]
  loaded: boolean
  refresh: () => Promise<void>
  markThreadRead: (otherId: number) => void
}

const Ctx = createContext<MessagesCtx | null>(null)

export function MessagesProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loaded, setLoaded] = useState(false)
  const rowsRef = useRef(conversations)
  rowsRef.current = conversations
  /** When we last opened a thread — a poll that left before that still counts its messages as unread. */
  const markedAt = useRef(0)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setConversations([])
      setLoaded(true)
      return
    }
    const startedAt = Date.now()
    try {
      const fresh = await api.get<Conversation[]>('/chat')
      if (markedAt.current <= startedAt) setConversations(fresh)  // else: it would put the badge back
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

  // This provider is mounted app-wide and already follows sign-in, so it owns the socket subscription: one
  // room per signed-in user, joined here rather than by whichever page happens to be open.
  useEffect(() => {
    const open = () => {
      if (getToken()) joinChat(() => api.get<ChatToken>('/chat/socket-token'))
      else leaveChat()
    }
    open()
    window.addEventListener('uko:auth', open)
    return () => {
      window.removeEventListener('uko:auth', open)
      leaveChat()
    }
  }, [])

  // A pushed message changes a count the badge shows, so re-read the list. `refresh` is cheap now that
  // GET /chat is an aggregate, and this only fires when something actually arrived.
  useEffect(() => onChat(() => { void refresh() }), [refresh])

  // Still polled underneath: the relay can be cold, rate-limiting or simply not configured, and a badge
  // that silently stops counting is worse than one that lags 30 s.
  usePolledRefresh(refresh)

  const markThreadRead = useCallback((otherId: number) => {
    // Called on every poll of an open thread, so do nothing at all once its count is already 0 —
    // otherwise sitting in one conversation would keep discarding the polls for the other ones.
    if (!rowsRef.current.some((c) => c.user_id === otherId && c.unread > 0)) return
    markedAt.current = Date.now()
    setConversations((rows) => rows.map((c) => (c.user_id === otherId ? { ...c, unread: 0 } : c)))
  }, [])

  const unread = useMemo(() => conversations.reduce((a, c) => a + c.unread, 0), [conversations])

  const value = useMemo(
    () => ({ unread, conversations, loaded, refresh, markThreadRead }),
    [unread, conversations, loaded, refresh, markThreadRead],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMessages(): MessagesCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMessages outside MessagesProvider')
  return v
}
