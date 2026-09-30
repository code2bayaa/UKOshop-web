import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Phone, Send } from 'lucide-react'
import { api, type ItemFull } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useMessages } from '#/lib/messages'
import { onChat } from '#/lib/sockets'
import { useToast } from '#/lib/toast'
import { fmtDate, priceRange } from '#/lib/format'
import { Avatar, Button, EmptyState, PageLoading, cx } from '#/components/ui'
import { Thumb } from '#/components/media'
import { BackLink } from '#/components/dashboard'

/** How often the thread re-asks the API for anything the socket did not bring. */
const FALLBACK_POLL_MS = 30000

type Search = { item?: number }
type Msg = { id: number; mine: boolean; message: string; item_id: number | null; time: string }
type Other = { id: number; name: string; replies_in: string; telephone: string }
/** `other` is null on a `?since=` poll — the header does not change mid-conversation, so it is sent once. */
type Thread = { other: Other | null; messages: Msg[] }

/** Fold a poll response into what we hold: a full load replaces, a delta merges by id (our own just-sent
 *  message was appended optimistically and comes back on the next poll, so the last write wins). */
function merge(prev: Thread, next: Thread): Thread {
  if (!next.messages.length) return prev
  const byId = new Map(prev.messages.map((m) => [m.id, m]))
  for (const m of next.messages) byId.set(m.id, m)
  return { ...prev, messages: [...byId.values()].sort((a, b) => a.id - b.id) }
}

export const Route = createFileRoute('/chat/$userId')({
  validateSearch: (s: Record<string, unknown>): Search => {
    const n = typeof s.item === 'number' ? s.item : typeof s.item === 'string' && s.item ? Number(s.item) : NaN
    return { item: Number.isFinite(n) ? n : undefined }
  },
  component: ChatThreadPage,
})

function ChatThreadPage() {
  const { userId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const { markThreadRead } = useMessages()
  const toast = useToast()
  const [thread, setThread] = useState<Thread | null>(null)
  const [error, setError] = useState('')
  const [item, setItem] = useState<ItemFull | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  /** Highest message id we hold — what the next poll asks for messages after. Deliberately not bumped by
   *  `send`: letting the poll re-deliver our own message is what keeps it honest if one crossed it. */
  const sinceRef = useRef(0)
  const threadRef = useRef<Thread | null>(null)
  threadRef.current = thread

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: `/chat/${userId}${search.item ? `?item=${search.item}` : ''}` } })
  }, [ready, user, navigate, userId, search.item])

  // One fetch, shared by the poll and the socket. `since` stays 0 until a full load has landed, so a
  // dropped thread re-loads in full rather than asking for a delta onto nothing.
  const fetchThread = useCallback(async (): Promise<void> => {
    if (!user) return
    const since = threadRef.current ? sinceRef.current : 0
    try {
      const t = await api.get<Thread>(`/chat/${userId}${since ? `?since=${since}` : ''}`)
      setThread((prev) => (since && prev ? merge(prev, t) : t))
      if (t.messages.length) {
        sinceRef.current = Math.max(since, ...t.messages.map((m) => m.id))
        // That GET flipped this thread's incoming messages to read — take them off the badge too.
        markThreadRead(Number(userId))
      }
      setError('')
    } catch (e: any) {
      setError(e.message || 'Could not load this conversation')
    }
  }, [user, userId, markThreadRead])

  // The poll is the safety net now, not the delivery mechanism: messages arrive over the socket below, and
  // this catches whatever it missed — a cold relay, a dropped connection, a token that expired mid-sitting,
  // or no SOCKETS_API_KEY at all. It ran every 5 s when polling *was* the delivery.
  useEffect(() => {
    if (!user) return
    sinceRef.current = 0
    void fetchThread()
    const timer = setInterval(() => { void fetchThread() }, FALLBACK_POLL_MS)
    return () => clearInterval(timer)
  }, [user, fetchThread])

  // Messages pushed by the relay. Only this conversation's are ours, and `mine` is worked out here because
  // the same payload goes to both ends.
  //
  // The local merge is for the eye — it paints immediately. The fetch behind it is what makes it true: only
  // rows the thread query actually returns get flipped to read, so `sinceRef` is deliberately left alone
  // here. Bumping it would make the follow-up fetch skip this very message and leave it unread for good.
  useEffect(() => {
    if (!user) return
    const other = Number(userId)
    return onChat((m) => {
      const between = (m.from_users_id === other && m.to_users_id === user.id) || (m.from_users_id === user.id && m.to_users_id === other)
      if (!between) return
      setThread((prev) => (prev ? merge(prev, { other: null, messages: [{ id: m.id, mine: m.from_users_id === user.id, message: m.message, item_id: m.item_id, time: m.time }] }) : prev))
      void fetchThread()
    })
  }, [user, userId, fetchThread])

  useEffect(() => {
    if (!user || !search.item) {
      setItem(null)
      return
    }
    api.get<ItemFull>(`/items/${search.item}`).then(setItem).catch(() => setItem(null))
  }, [user, search.item])

  const count = thread?.messages.length ?? 0
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const message = text.trim()
    if (!message || sending) return
    setSending(true)
    try {
      const m = await api.post<Msg>(`/chat/${userId}`, { message, item_id: search.item ?? null })
      setThread((t) => (t ? { ...t, messages: [...t.messages, m] } : t))
      setText('')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  if (!ready || !user) return <PageLoading />
  if (error && !thread) {
    return (
      <div className="container-x py-10">
        <EmptyState icon={<Send size={26} />} title="Conversation not found" sub={error} action={<BackLink to="/chat" label="Back to messages" />} />
      </div>
    )
  }
  // `other` only ever arrives with the full load, so no header means the first load has not landed yet.
  const other = thread?.other
  if (!thread || !other) return <PageLoading />

  const { messages } = thread

  return (
    <div className="container-x py-3 pb-24 md:py-7 md:pb-12">
      <div className="mx-auto flex max-w-[820px] flex-col overflow-hidden rounded-lg border border-border bg-bg">
        <div className="flex items-center gap-3 border-b border-border bg-surface px-3.5 py-3 md:px-[18px]">
          <BackLink to="/chat" label="Chats" />
          <Avatar name={other.name} size={38} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-bold text-ink">{other.name}</span>
            <span className="text-[11px] text-ink-2">Usually replies in {other.replies_in}</span>
          </div>
          <a href={other.telephone ? `tel:${other.telephone}` : undefined} aria-label="Call" className={cx('flex h-9 w-9 items-center justify-center rounded-full bg-primary-050 text-primary-600 transition-colors hover:bg-primary-300/40', !other.telephone && 'pointer-events-none opacity-50')}><Phone size={16} /></a>
        </div>

        {item && (
          <Link to="/items/$id" params={{ id: String(item.id) }} className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 transition-colors hover:bg-surface md:px-[18px]">
            <Thumb src={item.image} size={40} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-xs font-semibold text-ink">{item.title}</span>
              <span className="text-[11px] text-ink-2">{priceRange(item.min_amount, item.max_amount)}{item.shelve_name ? ` · ${item.shelve_name}` : ''}</span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-primary-600">View item</span>
          </Link>
        )}

        <div ref={scroller} className="flex min-h-[320px] max-h-[60vh] flex-col gap-2.5 overflow-y-auto bg-surface/40 px-3.5 py-4 md:px-[18px]">
          {messages.length === 0 && (
            <div className="my-auto text-center text-[13px] text-ink-2">Say hello to {other.name} — ask about condition, sizes or a direct pickup.</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cx('flex max-w-[78%] flex-col gap-1', m.mine ? 'self-end items-end' : 'self-start items-start')}>
              <span className={cx('rounded-lg px-3.5 py-2.5 text-[13px] leading-[1.45] whitespace-pre-wrap break-words', m.mine ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm border border-border bg-surface text-ink')}>{m.message}</span>
              <span className="px-1 text-[10px] text-muted">{fmtDate(m.time)}</span>
            </div>
          ))}
        </div>

        <form onSubmit={send} className="flex items-center gap-2 border-t border-border bg-bg px-3.5 py-3 md:px-[18px]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message ${other.name}`}
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3.5 py-[11px] text-sm text-ink outline-none placeholder:text-muted focus:border-primary-300 focus:ring-2 focus:ring-primary-050"
          />
          <Button type="submit" loading={sending} disabled={!text.trim()} icon={<Send size={15} />} className="shrink-0">
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </div>
    </div>
  )
}
