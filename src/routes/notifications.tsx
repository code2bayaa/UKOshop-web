import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeftRight, Banknote, Bell, Bike, Info, MessageCircle, ShoppingBag, Star, Store, Tag, type LucideIcon } from 'lucide-react'
import { type Notification } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useNotifications } from '#/lib/notifications'
import { useToast } from '#/lib/toast'
import { timeAgo } from '#/lib/format'
import { Button, EmptyState, PageLoading, PageTitle, cx } from '#/components/ui'

export const Route = createFileRoute('/notifications')({ component: NotificationsPage })

const ICONS: Record<string, LucideIcon> = { sale: Tag, order: ShoppingBag, payout: Banknote, delivery: Bike, shelve: Store, chat: MessageCircle, feedback: Star, barter: ArrowLeftRight, info: Info }

function NotificationsPage() {
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const toast = useToast()
  // The badge in the nav reads the same store, so anything marked read here drops it right away.
  const { unread, items, loaded, refresh, markRead, markAllRead } = useNotifications()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: '/notifications' } })
  }, [ready, user, navigate])

  useEffect(() => {
    if (user) refresh()
  }, [user, refresh])

  const markAll = async () => {
    setBusy(true)
    try {
      await markAllRead()
      toast.success('All notifications marked as read')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const open = async (n: Notification) => {
    markRead(n.id)
    if (!n.link) return
    if (/^https?:\/\//.test(n.link)) {
      window.location.href = n.link
      return
    }
    const u = new URL(n.link, 'http://uko.local')
    const search: Record<string, string> = {}
    u.searchParams.forEach((v, k) => { search[k] = v })
    navigate({ to: u.pathname as any, search: (Object.keys(search).length ? search : undefined) as any })
  }

  if (!ready || !user) return <PageLoading />

  return (
    <div className="container-x flex flex-col gap-4 py-5 pb-24 md:gap-[18px] md:py-7 md:pb-12">
      <PageTitle
        title="Notifications"
        sub={loaded ? (unread ? `${unread} unread` : 'You are all caught up') : 'Orders, payouts, deliveries and messages in one place'}
        action={<Button variant="outline" size="sm" loading={busy} disabled={unread === 0} onClick={markAll}>Mark all read</Button>}
      />
      {!loaded ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} title="No notifications yet" sub="Order updates, claim codes, payouts and chat replies will land here." />
      ) : (
        <div className="max-w-[820px] overflow-hidden rounded-lg border border-border bg-bg">
          {items.map((n) => {
            const Icon = ICONS[n.type] || Info
            return (
              <button key={n.id} type="button" onClick={() => open(n)} className={cx('flex w-full items-start gap-3 border-b border-border px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface md:gap-3.5 md:px-[18px]', !n.is_read && 'bg-primary-050/40')}>
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', n.is_read ? 'bg-surface-2 text-ink-2' : 'bg-primary-050 text-primary')}><Icon size={16} /></span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cx('text-[13px] text-ink', n.is_read ? 'font-semibold' : 'font-bold')}>{n.title}</span>
                  {n.body && <span className="text-xs leading-[1.5] text-ink-2">{n.body}</span>}
                  <span className="text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                </span>
                {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
