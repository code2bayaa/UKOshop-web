import { useEffect } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { MessageCircle } from 'lucide-react'
import { useAuth } from '#/lib/auth'
import { useMessages } from '#/lib/messages'
import { timeAgo } from '#/lib/format'
import { Avatar, Chip, EmptyState, LinkButton, PageLoading, PageTitle, cx } from '#/components/ui'

export const Route = createFileRoute('/chat/')({ component: ChatListPage })

function ChatListPage() {
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  // Same store the Messages badge in the nav reads — opening a thread takes it down everywhere.
  const { unread, conversations: rows, loaded, refresh } = useMessages()

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: '/chat' } })
  }, [ready, user, navigate])

  useEffect(() => {
    if (user) refresh()
  }, [user, refresh])

  if (!ready || !user) return <PageLoading />

  return (
    <div className="container-x flex flex-col gap-4 py-5 pb-24 md:gap-[18px] md:py-7 md:pb-12">
      <PageTitle title="Messages" sub={rows.length ? (unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Chats with sellers and buyers') : 'Chats with sellers and buyers'} />
      {!loaded ? (
        <PageLoading />
      ) : rows.length === 0 ? (
        <EmptyState icon={<MessageCircle size={28} />} title="No conversations yet" sub="Ask a seller a question from any item page and the thread will show up here." action={<LinkButton to={'/items' as any}>Browse items</LinkButton>} />
      ) : (
        <div className="max-w-[820px] overflow-hidden rounded-lg border border-border bg-bg">
          {rows.map((c) => (
            <Link
              key={c.user_id}
              to="/chat/$userId"
              params={{ userId: String(c.user_id) }}
              search={c.item_id ? { item: c.item_id } : {}}
              className={cx('flex w-full items-center gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-surface md:gap-3.5 md:px-[18px]', c.unread > 0 && 'bg-primary-050/40')}
            >
              <Avatar name={c.name} size={42} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center justify-between gap-2">
                  <span className={cx('truncate text-[13px] text-ink', c.unread ? 'font-bold' : 'font-semibold')}>{c.name}</span>
                  <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.time)}</span>
                </span>
                <span className={cx('truncate text-xs', c.unread ? 'text-ink' : 'text-ink-2')}>{c.last}</span>
              </span>
              {c.unread > 0 && <Chip size="sm" tone="primary">{c.unread}</Chip>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
