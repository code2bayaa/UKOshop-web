/**
 * Seller console sections added by the barter / wallet / packages PRD:
 * Orders (paged, "load more" + page bar), Barter bids (accept / decline) and Messaging (pay-per-use units: email · SMS · WhatsApp · X · Facebook · Instagram).
 * Used only by src/routes/seller.tsx — kept here so that file stays readable.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, BellRing, Check, ClipboardList, Crown, ExternalLink, Facebook, ImageIcon, Instagram, Lock, Mail, MapPin, MessageCircle, MessageSquare, Music, Package, Paperclip, Play, Send, Store, Target, Twitter, Users, X, type LucideIcon } from 'lucide-react'
import { api, type AudienceData, type Bid, type BulkChannel, type Campaign, type ChannelUnits, type ItemCard, type MessagingChannel, type Order, type SocialAccounts, type SocialPolicy, type SocialProvider, type Targeting } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh, kshCents } from '#/lib/format'
import { Avatar, Button, Checkbox, Chip, EmptyState, Input, Notice, PageLoading, Select, StatusPill, Tabs, Textarea, cx } from './ui'
import { Panel } from './dashboard'
import { OrderChat } from './order-chat'
import { RichEditor } from './media'
import { Thumb } from './media'

// ================================================================ Orders
/** `/seller/orders` hands a seller only his own lines of a shared cart: `items` and `item_count` are
 *  already filtered, `seller_subtotal` is what those lines are worth (the order `total` is the buyer's
 *  bill for everyone's items) and `other_sellers` counts who else is on the order, not what they sold. */
type SellerOrder = Order & { trade_label: string; via_shelve: boolean; location: string; is_new: boolean; seller_subtotal: number; other_sellers: number }
/** How long a new order has to stay on screen before it counts as read — long enough that a fling-scroll past it does not. */
const SEEN_AFTER_MS = 700
type OrderCounts = { all: number; accepted: number; cancelled: number; returned: number }
type OrdersPage = { orders: SellerOrder[]; total: number; page: number; pages: number; counts: OrderCounts }
type OrderTab = keyof OrderCounts
const PER_PAGE = 6
const ORDER_TABS: { key: OrderTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'returned', label: 'Returned' },
]
const SELLER_STATUS: Record<Order['seller_status'], { label: string; tone: 'success' | 'danger' | 'warning' }> = {
  accepted: { label: 'Accepted', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  returned: { label: 'Returned', tone: 'warning' },
}
const EMPTY_ORDERS: Record<OrderTab, { title: string; sub: string }> = {
  all: { title: 'No orders yet', sub: 'Paid orders and accepted barter trades on your ads show up here the moment a buyer checks out.' },
  accepted: { title: 'No accepted orders', sub: 'Every new paid order starts as accepted — cancel it while the item is still with you, or mark it returned once it has moved.' },
  cancelled: { title: 'No cancelled orders', sub: 'Orders you cancel go back into stock and the buyer is notified.' },
  returned: { title: 'No returned orders', sub: 'Mark an order returned once the buyer has brought the item back to you or the shelf.' },
}

export function OrdersSection({ onChanged, onSeen }: { onChanged: () => void; onSeen: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState<OrderTab>('all')
  const [pages, setPages] = useState<Record<number, SellerOrder[]>>({})
  const [meta, setMeta] = useState<Omit<OrdersPage, 'orders'> | null>(null)
  const [loading, setLoading] = useState<number | null>(null)
  const [current, setCurrent] = useState(1)
  const [busy, setBusy] = useState<number | null>(null)
  const loaded = useRef<Record<number, SellerOrder[]>>({})

  const fetchPage = (t: OrderTab, p: number) => api.get<OrdersPage>('/seller/orders', { status: t, page: p, per_page: PER_PAGE })
  const commit = () => setPages({ ...loaded.current })

  const loadFirst = async (t: OrderTab) => {
    loaded.current = {}
    setPages({})
    setMeta(null)
    setCurrent(1)
    try {
      const r = await fetchPage(t, 1)
      loaded.current = { 1: r.orders }
      commit()
      setMeta({ total: r.total, page: r.page, pages: r.pages, counts: r.counts })
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  useEffect(() => {
    loadFirst(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  /** Load every page up to n that is not in memory yet (in order, so the anchors appear in sequence). */
  const loadUpTo = async (n: number) => {
    try {
      for (let p = 2; p <= n; p++) {
        if (loaded.current[p]) continue
        setLoading(p)
        const r = await fetchPage(tab, p)
        loaded.current = { ...loaded.current, [p]: r.orders }
        commit()
        setMeta({ total: r.total, page: r.page, pages: r.pages, counts: r.counts })
      }
      return true
    } catch (e: any) {
      toast.error(e.message)
      return false
    } finally {
      setLoading(null)
    }
  }
  const jumpTo = async (n: number) => {
    if (!(await loadUpTo(n))) return
    setCurrent(n)
    window.setTimeout(() => document.getElementById(`page-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  const refreshLoaded = async () => {
    const nums = Object.keys(loaded.current).map(Number)
    try {
      const rs = await Promise.all(nums.map((p) => fetchPage(tab, p)))
      loaded.current = Object.fromEntries(rs.map((r) => [r.page, r.orders]))
      commit()
      const last = rs[rs.length - 1]
      if (last) setMeta({ total: last.total, page: last.page, pages: last.pages, counts: last.counts })
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  /**
   * Decide one line (`item`) or, with none given, every line of his on that order. Cancelling or
   * returning pays the buyer back for that item alone — the rest of the cart carries on — so the
   * confirmation says what is being pulled and what it costs.
   */
  const setStatus = async (o: SellerOrder, seller_status: Order['seller_status'], item?: SellerOrder['items'][number]) => {
    // Cancelling is refused by the API once the item has left his shop; the button is already disabled
    // with the reason on it, and this catches the card that went stale between a refresh and a click.
    if (seller_status === 'cancelled') {
      const blocked = (item ? [item] : o.items.filter((it) => it.seller_status === 'accepted')).map((it) => it.cancel_block).find(Boolean)
      if (blocked) return toast.error(blocked)
    }
    const verb = seller_status === 'cancelled' ? 'Cancel' : seller_status === 'returned' ? 'Mark as returned' : 'Mark as accepted'
    const what = item ? item.title : `all your items on ${o.order_no}`
    const money = seller_status === 'accepted' ? '' : ` ${ksh(item ? item.amount * item.quantity : o.seller_subtotal ?? o.total)} goes back to the buyer's UKO wallet and cannot be undone.`
    if (!window.confirm(`${verb}: ${what}?${money} The buyer will be notified.`)) return
    setBusy(o.id)
    try {
      await api.post(`/seller/orders/${o.id}/status`, { seller_status, item_id: item?.id })
      toast.success(`${item ? item.title : `All your items on ${o.order_no}`} marked ${SELLER_STATUS[seller_status].label.toLowerCase()}`)
      await refreshLoaded()
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  /** Orders already reported seen, so a re-render or a refetch cannot count one twice. */
  const seen = useRef<Set<number>>(new Set())
  const markSeen = useCallback((orderId: number) => {
    if (seen.current.has(orderId)) return
    seen.current.add(orderId)
    onSeen()
    api.post(`/seller/orders/seen?id=${orderId}`).catch(() => seen.current.delete(orderId))
  }, [onSeen])

  const nums = Object.keys(pages).map(Number).sort((a, b) => a - b)
  const loadedMax = nums.length ? nums[nums.length - 1] : 0
  const totalPages = meta?.pages ?? 1
  const counts = meta?.counts

  return (
    <>
      <Panel
        title="Orders"
        sub={meta ? `${meta.total} order${meta.total === 1 ? '' : 's'} · ${PER_PAGE} per page · cancel, accept or mark returned from each card` : 'Loading your orders…'}
        action={
          <div className="no-scrollbar flex max-w-full gap-2 overflow-x-auto">
            {ORDER_TABS.map((t) => (
              <Chip key={t.key} size="sm" active={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}{counts ? ` · ${counts[t.key]}` : ''}
              </Chip>
            ))}
          </div>
        }
      >
        {!meta ? (
          <PageLoading />
        ) : nums.length === 0 || (pages[1] || []).length === 0 ? (
          <EmptyState icon={<ClipboardList size={26} />} title={EMPTY_ORDERS[tab].title} sub={EMPTY_ORDERS[tab].sub} />
        ) : (
          <div className="flex flex-col gap-5">
            {nums.map((n) => (
              <div key={n} id={`page-${n}`} className="flex scroll-mt-20 flex-col gap-3">
                <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <span className="h-px flex-1 bg-border" />Page {n} of {totalPages}<span className="h-px flex-1 bg-border" />
                </div>
                {pages[n].map((o) => <OrderCard key={o.id} order={o} busy={busy === o.id} onStatus={(s) => setStatus(o, s)} onSeen={markSeen} />)}
              </div>
            ))}
            {loadedMax < totalPages && (
              <div className="flex justify-center">
                <Button variant="outline" loading={loading !== null} onClick={() => loadUpTo(loadedMax + 1).then((ok) => ok && setCurrent(loadedMax + 1))}>
                  Load more · page {loadedMax + 1} of {totalPages}
                </Button>
              </div>
            )}
          </div>
        )}
      </Panel>

      {meta && totalPages > 1 && (
        <div className="sticky bottom-0 z-20 -mx-4 -mt-2 border-t border-border bg-bg/95 px-4 py-2 backdrop-blur md:-mx-7 md:px-7">
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
            <span className="shrink-0 text-[11px] text-muted">Pages</span>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled={loading !== null}
                onClick={() => jumpTo(n)}
                title={pages[n] ? `Go to page ${n}` : `Load and go to page ${n}`}
                className={cx('flex h-7 min-w-7 shrink-0 items-center justify-center rounded-sm border px-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50', n === current ? 'border-primary bg-primary text-white' : pages[n] ? 'border-border bg-bg text-ink hover:bg-surface-2' : 'border-dashed border-border-strong bg-surface text-ink-2 hover:bg-surface-2')}
              >
                {loading === n ? '…' : n}
              </button>
            ))}
            <span className="ml-auto shrink-0 text-[11px] text-muted">{loadedMax} of {totalPages} loaded</span>
          </div>
        </div>
      )}
    </>
  )
}

function OrderCard({ order: o, busy, onStatus, onSeen }: { order: SellerOrder; busy: boolean; onStatus: (s: Order['seller_status'], item?: SellerOrder['items'][number]) => void; onSeen: (orderId: number) => void }) {
  const barter = o.trade_type === 'barter'
  // The card's verdict is read off his own lines, not off the order: a cart he has half pulled says so.
  const standing = o.items.filter((it) => it.seller_status === 'accepted').length
  const rolled: Order['seller_status'] = standing > 0 ? 'accepted' : o.items.some((it) => it.seller_status === 'returned') ? 'returned' : 'cancelled'
  // "Cancel all" goes as soon as one standing line has moved — he cancels the rest line by line.
  const blockedAll = o.items.filter((it) => it.seller_status === 'accepted').map((it) => it.cancel_block).find(Boolean) || ''
  const st = SELLER_STATUS[rolled] || SELLER_STATUS.accepted
  const refunded = o.items.reduce((n, it) => n + (it.refund_amount || 0), 0)
  const card = useRef<HTMLElement>(null)

  // A new order stops being new once he has actually scrolled to it and it stayed on screen — not when he
  // merely opens the section. The "New" ribbon stays until the next refetch, so he can still see which ones
  // they were after the badge has gone down.
  useEffect(() => {
    const el = card.current
    if (!o.is_new || !el) return
    if (typeof IntersectionObserver === 'undefined') return onSeen(o.id)  // no observer: opening the list is as good as it gets
    let timer: number | null = null
    const stop = () => { if (timer) { window.clearTimeout(timer); timer = null } }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return stop()
      if (timer) return
      timer = window.setTimeout(() => { io.disconnect(); onSeen(o.id) }, SEEN_AFTER_MS)
    }, { threshold: 0.4 })
    io.observe(el)
    return () => { stop(); io.disconnect() }
  }, [o.id, o.is_new, onSeen])
  const cell = (label: string, value: ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1 rounded-sm bg-surface px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="min-w-0 text-[12px] font-medium text-ink">{value}</span>
    </div>
  )
  return (
    <article ref={card} className={cx('flex flex-col gap-3 rounded-lg border bg-bg p-4', o.is_new ? 'border-secondary/40' : 'border-border', busy && 'opacity-60')}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-head text-[13px] font-bold text-ink">{o.order_no}</span>
          {o.is_new && <Chip size="sm" tone="secondary">New</Chip>}
          <Chip size="sm" tone={st.tone}>{st.label}</Chip>
          <StatusPill status={o.status} />
        </div>
        <span className="text-[11px] text-muted">{fmtDate(o.created_at)}</span>
      </header>

      {/* Each line stands or falls on its own: accepted, cancelled or returned, with its own refund. */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {o.items.map((it) => {
          const lineSt = SELLER_STATUS[it.seller_status] || SELLER_STATUS.accepted
          const pulled = it.seller_status !== 'accepted'
          return (
            <li key={it.id} className={cx('flex flex-col gap-2 rounded-sm border border-border px-3 py-2.5', pulled && 'bg-surface')}>
              <div className="flex items-center gap-3">
                <Thumb src={it.image} size={40}>{!it.image && <Package size={16} className="text-border-strong" />}</Thumb>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link to="/items/$id" params={{ id: String(it.item_id) }} className={cx('truncate text-[13px] font-semibold hover:text-primary', pulled ? 'text-ink-2 line-through' : 'text-ink')}>{it.title}</Link>
                  <span className="truncate text-[11px] text-muted">{it.variant_label ? `${it.variant_label} · ` : ''}{it.code}</span>
                </div>
                <span className="whitespace-nowrap text-[12px] text-ink-2">×{it.quantity}</span>
                <span className="whitespace-nowrap text-[12px] font-semibold text-ink">{ksh(it.amount * it.quantity)}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Chip size="sm" tone={lineSt.tone}>{lineSt.label}</Chip>
                  {it.refund_amount > 0 && <span className="text-[11px] text-muted">{ksh(it.refund_amount)} back in the buyer's wallet</span>}
                  {/* Why the cancel button is off: the item is on a shelf, with the rider, or already delivered. */}
                  {it.seller_status === 'accepted' && !it.refund_amount && it.cancel_block && (
                    <span className="flex items-center gap-1 text-[11px] text-muted"><Lock size={11} />{it.cancel_block}</span>
                  )}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {it.refund_amount > 0 ? (
                    <span className="text-[11px] text-muted">Settled — he orders it again if he still wants it</span>
                  ) : (
                    <>
                      {it.seller_status !== 'returned' && <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus('returned', it)}>Returned</Button>}
                      {it.seller_status !== 'cancelled' && (
                        <span title={it.cancel_block || 'Cancel this item and refund the buyer'}>
                          <Button size="sm" variant="outline" disabled={busy || o.status === 'completed' || !!it.cancel_block} className="border-danger/40 text-danger hover:bg-danger-050" icon={<X size={13} />} onClick={() => onStatus('cancelled', it)}>Cancel item</Button>
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      {o.other_sellers > 0 && (
        <span className="text-[11px] text-muted">
          Shared cart — {o.other_sellers} other seller{o.other_sellers === 1 ? '' : 's'} on this order. You see your own items only.
        </span>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {cell('Type of trade', <Chip size="sm" tone={barter ? 'secondary' : 'primary'} className="max-w-full"><span className="truncate">{o.trade_label || (barter ? 'Barter trade' : 'Only cash')}</span></Chip>)}
        {cell('Shelves or not', o.via_shelve && o.shelve ? <Chip size="sm" tone="primary" className="max-w-full"><Store size={11} /><span className="truncate">Via {o.shelve.name}</span></Chip> : <Chip size="sm">Direct</Chip>)}
        {cell('Location', <span className="block truncate">{o.location || o.ward || '—'}</span>)}
        {cell('Your items', <span className="font-head text-sm font-extrabold">{ksh(o.seller_subtotal ?? o.total)}</span>)}
        {cell('Time', fmtDate(o.created_at))}
      </div>

      <OrderChat order={o} viewer="seller" />

      <footer className="flex flex-col gap-2.5 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={o.buyer_name || 'Buyer'} size={28} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-bold text-ink">{o.buyer_name || 'Buyer'}</span>
            <span className="truncate text-[11px] text-ink-2">{o.buyer_phone || '—'}{o.delivery_option ? ` · ${o.delivery_option}` : ''}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {refunded > 0 && <span className="text-[11px] font-semibold text-danger">−{ksh(refunded)} refunded</span>}
          {standing > 1 && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus('returned')}>Return all</Button>
              <span title={blockedAll || 'Cancel every item of yours on this order and refund the buyer'}>
                <Button size="sm" variant="outline" disabled={busy || o.status === 'completed' || !!blockedAll} className="border-danger/40 text-danger hover:bg-danger-050" icon={<X size={13} />} onClick={() => onStatus('cancelled')}>Cancel all</Button>
              </span>
            </>
          )}
        </div>
      </footer>
    </article>
  )
}

// ================================================================ Barter bids
export const OFFER_LABEL: Record<Bid['offer_type'], string> = { item: 'Item for item', item_cash: 'Item + cash', item_service: 'Item + service', service: 'Service', cash_service: 'Cash + service' }
const BID_STATUS: Record<string, { tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'secondary'; label: string }> = {
  pending: { tone: 'warning', label: 'Pending' },
  accepted: { tone: 'primary', label: 'Accepted · direct trade' },
  awaiting_inspection: { tone: 'primary', label: 'Awaiting inspection' },
  inspected: { tone: 'primary', label: 'Inspected' },
  completed: { tone: 'success', label: 'Completed' },
  rejected_inspection: { tone: 'danger', label: 'Denied at inspection' },
  declined: { tone: 'danger', label: 'Declined' },
  cancelled: { tone: 'neutral', label: 'Cancelled by buyer' },
}
function BidStatus({ status }: { status: Bid['status'] }) {
  const m = BID_STATUS[status] || { tone: 'neutral' as const, label: status.replace(/_/g, ' ') }
  return <Chip size="sm" tone={m.tone}>{m.label}</Chip>
}

export function BidsSection({ onChanged }: { onChanged: () => void }) {
  const toast = useToast()
  const [bids, setBids] = useState<Bid[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [declining, setDeclining] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const load = () => api.get<Bid[]>('/bids', { role: 'seller' }).then(setBids).catch((e) => toast.error(e.message))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const decide = async (b: Bid, decision: 'accept' | 'decline') => {
    if (decision === 'accept' && !window.confirm(`Accept ${b.buyer?.name || 'this buyer'}'s offer for "${b.item?.title || 'your item'}"? An order is created and the buyer is notified.`)) return
    setBusy(b.id)
    try {
      const r = await api.post<Bid>(`/bids/${b.id}/decide`, decision === 'accept' ? { decision } : { decision, note: note.trim() })
      if (decision === 'accept') {
        toast.success(r.order_id ? `Offer accepted · order #${r.order_id} created${r.shelve ? ` · trade at ${r.shelve.name}` : ' · trade directly with the buyer'}` : 'Offer accepted')
      } else {
        toast.success('Offer declined — the buyer has been notified')
      }
      setDeclining(null)
      setNote('')
      await load()
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (!bids) return <PageLoading />
  const pending = bids.filter((b) => b.status === 'pending')
  const history = bids.filter((b) => b.status !== 'pending')

  const card = (b: Bid) => {
    const open = b.status === 'pending'
    return (
      <article key={b.id} className={cx('flex flex-col gap-3 rounded-lg border bg-bg p-4', open ? 'border-secondary/40' : 'border-border', busy === b.id && 'opacity-60')}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={b.buyer?.name || 'Buyer'} size={30} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-bold text-ink">{b.buyer?.name || 'Buyer'}</span>
              <span className="truncate text-[11px] text-ink-2">{b.buyer?.telephone || '—'}{b.created_at ? ` · ${fmtDate(b.created_at)}` : ''}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {b.order_id && <Chip size="sm" tone="primary">Order #{b.order_id}</Chip>}
            <BidStatus status={b.status} />
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="flex items-center gap-3 rounded-md bg-surface p-3">
            <Thumb src={b.item?.image} size={46}>{!b.item?.image && <Package size={18} className="text-border-strong" />}</Thumb>
            <div className="flex min-w-0 flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Your item</span>
              {b.item ? (
                <Link to="/items/$id" params={{ id: String(b.item.id) }} className="truncate text-[13px] font-semibold text-ink hover:text-primary">{b.item.title}</Link>
              ) : (
                <span className="truncate text-[13px] font-semibold text-ink">Item #{b.item_id}</span>
              )}
              <span className="truncate text-[11px] text-ink-2">{b.item ? `${ksh(b.item.min_amount)} · ${b.item.condition === 'new' ? 'brand new' : 'used'}` : ''}</span>
            </div>
          </div>
          <span className="hidden text-muted md:block"><ArrowLeftRight size={18} /></span>
          <div className="flex flex-col gap-1.5 rounded-md bg-surface p-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Buyer offers · {OFFER_LABEL[b.offer_type] || b.offer_type}</span>
            {b.offered_item && <span className="text-[13px] font-semibold text-ink">{b.offered_item}</span>}
            {b.offered_item_images?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {b.offered_item_images.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer"><Thumb src={src} size={48} /></a>)}
              </div>
            )}
            {b.offered_service && <span className="text-[12px] text-ink"><span className="text-ink-2">Service: </span>{b.offered_service}</span>}
            {b.cash_amount > 0 && <span className="text-[12px] text-ink"><span className="text-ink-2">Cash: </span><strong className="font-head">{ksh(b.cash_amount)}</strong></span>}
            {b.message && <span className="text-[11px] italic text-muted">“{b.message}”</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {b.trade_mode === 'shelve' && b.shelve ? (
            <Chip size="sm" tone="primary"><Store size={11} /> At {b.shelve.name} · fee {ksh(b.shelve_fee)}</Chip>
          ) : (
            <Chip size="sm">Direct trade</Chip>
          )}
          {b.inspection_notes && <span className="text-[11px] text-muted">Note: “{b.inspection_notes}”</span>}
        </div>

        {open && declining !== b.id && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button size="sm" variant="secondary" loading={busy === b.id} icon={<Check size={13} />} onClick={() => decide(b, 'accept')}>Accept offer</Button>
            <Button size="sm" variant="outline" disabled={busy === b.id} onClick={() => { setDeclining(b.id); setNote('') }}>Decline</Button>
          </div>
        )}
        {open && declining === b.id && (
          <form className="flex flex-col gap-2.5 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); decide(b, 'decline') }}>
            <Textarea label="Reason (optional, shown to the buyer)" placeholder="e.g. Looking for a newer model" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" variant="danger" loading={busy === b.id}>Confirm decline</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDeclining(null)}>Keep pending</Button>
            </div>
          </form>
        )}
      </article>
    )
  }

  return (
    <>
      <Panel title="Pending offers" sub="Accept to create the order · shelf trades are inspected by the shelf owner before both items change hands" action={<Chip size="sm" tone="warning">{pending.length}</Chip>}>
        {pending.length === 0 ? (
          <EmptyState icon={<ArrowLeftRight size={26} />} title="No pending offers" sub="Turn on barter trade when you post an ad and buyers can offer items, services or cash top-ups." />
        ) : (
          <div className="flex flex-col gap-3">{pending.map(card)}</div>
        )}
      </Panel>
      <Panel title="History" sub="Accepted, completed, declined and cancelled offers" action={<Chip size="sm">{history.length}</Chip>}>
        {history.length === 0 ? (
          <EmptyState icon={<ClipboardList size={26} />} title="No decided offers yet" sub="Offers you accept or decline are kept here with the inspection outcome." />
        ) : (
          <div className="flex flex-col gap-3">{history.map(card)}</div>
        )}
      </Panel>
    </>
  )
}

// ================================================================ Messaging (email · sms · whatsapp · x · facebook · instagram) — pay-per-use units
type Delivery = 'live' | 'sandbox' | 'simulated'
type CampaignsData = {
  has_package: boolean; audience_size: number; campaigns: Campaign[]
  /** past buyers each direct channel can reach: paid an order, still allow marketing on it, reachable (push: a device) */
  buyer_reach?: Partial<Record<MessagingChannel, number>>
  channels?: MessagingChannel[]; delivery?: Partial<Record<MessagingChannel, Delivery>>
  max_recipients?: number; balances?: Partial<Record<MessagingChannel, number>>; unit_prices?: Partial<Record<MessagingChannel, number>>; accounts?: Partial<SocialAccounts>
  social_policy?: SocialPolicy
  /** WhatsApp attachments: which kinds, Meta's size ceiling per kind, whether a media template is approved and
   *  which kinds that template header can carry (audio never can — it is always free-form) */
  whatsapp_media?: WhatsAppMedia
  /** the “UKO: {seller name}” line every campaign SMS opens with (app/messaging.py sms_from) */
  sms_sender?: string
  /** bulk, ward-targeted sends: the channels that have an audience, the wards the package was bought for and their reach */
  bulk_channels?: BulkChannel[]
  targeting?: Targeting
  bulk?: (AudienceData & { max_per_campaign: number }) | null
}
/** Who a direct campaign goes to. "buyers" and "contacts" are this seller's own people; "wards" is bulk — every
 *  UKO account registered in the wards they picked (app/audience.py), which is what a package is priced per message for. */
type AudienceMode = 'buyers' | 'wards' | 'contacts'
const AUDIENCE_MODES: { key: AudienceMode; label: string; Icon: LucideIcon }[] = [
  { key: 'buyers', label: 'My past buyers', Icon: Store },
  { key: 'wards', label: 'Target wards', Icon: MapPin },
  { key: 'contacts', label: 'My own list', Icon: ClipboardList },
]
/** X counts every URL as 23 characters. */
const xChars = (text: string) => text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length
type SentCampaign = Campaign & { balance: number }
const splitContacts = (s: string) => [...new Set(s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))]
const n0 = (n: number) => n.toLocaleString('en-KE')
type MediaKind = 'image' | 'video' | 'audio'
type Attachment = { path: string; url: string; type: MediaKind }
type WhatsAppMedia = { types: MediaKind[]; max_mb: Partial<Record<MediaKind, number>>; template: boolean; template_types?: string[] }
const MEDIA_ICON: Record<MediaKind, LucideIcon> = { image: ImageIcon, video: Play, audio: Music }

/** CKEditor HTML → the plain text WhatsApp actually renders. WhatsApp has no HTML: bold, italic and strikethrough
 *  are marker characters and everything else (headings, tables, colours) has no equivalent, which is why the
 *  WhatsApp toolbar only offers what survives this conversion. Mirrors nothing on the API — the message is
 *  converted here and stored already converted, so History and the gateway see the same plain text. */
export function htmlToWhatsApp(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<(strong|b)>([\s\S]*?)<\/(strong|b)>/gi, '*$2*')
    .replace(/<(em|i)>([\s\S]*?)<\/(em|i)>/gi, '_$2_')
    .replace(/<(s|del|strike)>([\s\S]*?)<\/(s|del|strike)>/gi, '~$2~')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Still with the API's delivery worker — its units are held and its result is not in yet. */
const isSending = (status: string) => status === 'queued' || status === 'sending'
const POLL_MS = 2500

/** Channel copy shared by Messaging and Seller packages (tab order: Email, SMS, WhatsApp, X, Facebook, Instagram). */
export const MSG_CHANNELS: { key: MessagingChannel; label: string; short: string; verb: string; noun: string; unit: string; units: string; Icon: LucideIcon }[] = [
  { key: 'email', label: 'Email messaging', short: 'E-mail', verb: 'Send email', noun: 'email', unit: 'e-mail', units: 'e-mails', Icon: Mail },
  { key: 'sms', label: 'SMS messaging', short: 'SMS', verb: 'Send SMS', noun: 'SMS', unit: 'SMS', units: 'SMS', Icon: MessageSquare },
  { key: 'whatsapp', label: 'WhatsApp messaging', short: 'WhatsApp', verb: 'Send WhatsApp', noun: 'WhatsApp message', unit: 'WhatsApp message', units: 'WhatsApp messages', Icon: MessageCircle },
  { key: 'push', label: 'Push notifications', short: 'Push', verb: 'Send push', noun: 'push notification', unit: 'push notification', units: 'push notifications', Icon: BellRing },
  { key: 'twitter', label: 'Post on X', short: 'X', verb: 'Post on X', noun: 'post on X', unit: 'X post', units: 'X posts', Icon: Twitter },
  { key: 'facebook', label: 'Post on Facebook', short: 'Facebook', verb: 'Post on Facebook', noun: 'Facebook post', unit: 'Facebook post', units: 'Facebook posts', Icon: Facebook },
  { key: 'instagram', label: 'Post on Instagram', short: 'Instagram', verb: 'Post on Instagram', noun: 'Instagram post', unit: 'Instagram post', units: 'Instagram posts', Icon: Instagram },
]
export const channelMeta = (c: string) => MSG_CHANNELS.find((x) => x.key === c) || MSG_CHANNELS[0]
export const isSocialChannel = (c: string): c is SocialProvider => c === 'twitter' || c === 'facebook' || c === 'instagram'
/** "200 SMS · 1,000 e-mails · 10 X posts" */
export const unitsSummary = (units: ChannelUnits | null | undefined) =>
  MSG_CHANNELS.filter((c) => Number(units?.[c.key] || 0) > 0).map((c) => { const n = Number(units![c.key]); return `${n0(n)} ${n === 1 ? c.unit : c.units}` }).join(' · ')

// SMS billing parts — mirrors the API (GSM-7: 160 / 153 per part, extension characters count twice; anything else e.g. emoji: 70 / 67)
const GSM7 = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€")
const GSM7_EXT = new Set('^{}\\[~]|€')
export function smsParts(text: string): number {
  const chars = [...text]
  if (chars.every((c) => GSM7.has(c))) {
    const len = chars.reduce((n, c) => n + (GSM7_EXT.has(c) ? 2 : 1), 0)
    return len <= 160 ? 1 : Math.ceil(len / 153)
  }
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67)
}

// ================================================================ Ward targeting — who a bulk campaign reaches
// GET /seller/audience · shared by Seller packages (how many messages to buy) and Messaging (how many to send now).
// The wards on offer are the wards accounts are actually registered in, each with its own reach, so the seller picks
// by audience rather than by map. Reach leaves out anyone who has switched marketing off and anyone the channel
// cannot reach, which is why it is also the ceiling on what can be sent.
export const BULK_CHANNELS: BulkChannel[] = ['email', 'sms', 'whatsapp', 'push']
export const isBulkChannel = (c: string): c is BulkChannel => BULK_CHANNELS.includes(c as BulkChannel)
export const emptyTargeting = (): Targeting => ({ country: '', county: '', wards: [] })

/** GET /seller/audience for a channel and a set of wards — debounced, stale answers ignored. */
export function useAudience(channel: BulkChannel | null, targeting: Targeting) {
  const [audience, setAudience] = useState<AudienceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const key = `${channel}|${targeting.country || ''}|${targeting.county || ''}|${(targeting.wards || []).join(',')}`
  useEffect(() => {
    if (!channel) {
      setAudience(null)
      return
    }
    let live = true
    setLoading(true)
    const t = setTimeout(() => {
      api.get<AudienceData>('/seller/audience', { channel, wards: targeting.wards || [], county: targeting.county || '', country: targeting.country || '' })
        .then((r) => { if (live) { setAudience(r); setErr('') } })
        .catch((e: any) => { if (live) { setAudience(null); setErr(e.message || 'Could not count your audience') } })
        .finally(() => { if (live) setLoading(false) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { audience, loading, err }
}

/** County + ward picker with the reach of every ward, and the total the picked wards come to. */
export function WardTargeting({ channel, value, onChange, audience, loading, disabled }: {
  channel: BulkChannel; value: Targeting; onChange: (t: Targeting) => void
  audience: AudienceData | null; loading: boolean; disabled?: boolean
}) {
  const meta = channelMeta(channel)
  const picked = value.wards || []
  const chosen = new Set(picked.map((w) => w.toLowerCase()))
  const rows = audience?.ward_reach || []
  const toggle = (ward: string) =>
    onChange({ ...value, wards: chosen.has(ward.toLowerCase()) ? picked.filter((w) => w.toLowerCase() !== ward.toLowerCase()) : [...picked, ward] })

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Country" value={value.country || audience?.country || ''} disabled={disabled}
          onChange={(e) => onChange({ country: e.target.value, county: '', wards: [] })}>
          {(audience?.countries || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select label="County" placeholder="Every county" value={value.county || ''} disabled={disabled}
          onChange={(e) => onChange({ ...value, county: e.target.value, wards: [] })}>
          {(audience?.counties || []).map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-ink-2">Wards{picked.length > 0 && <span className="text-muted"> · {picked.length} picked</span>}</span>
          <div className="flex gap-2.5">
            <button type="button" disabled={disabled || rows.length === 0} onClick={() => onChange({ ...value, wards: rows.map((r) => r.ward) })}
              className="text-[11px] font-semibold text-primary hover:underline disabled:text-muted disabled:no-underline">Select all</button>
            <button type="button" disabled={disabled || picked.length === 0} onClick={() => onChange({ ...value, wards: [] })}
              className="text-[11px] font-semibold text-ink-2 hover:underline disabled:text-muted disabled:no-underline">Clear</button>
          </div>
        </div>
        {loading && rows.length === 0 ? (
          <span className="text-[11px] text-muted">Counting who is out there…</span>
        ) : rows.length === 0 ? (
          <Notice tone="info" icon={<MapPin size={15} />}>No accounts are registered here yet — leave the wards empty to reach everyone {meta.short} can.</Notice>
        ) : (
          <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const on = chosen.has(r.ward.toLowerCase())
              return (
                <button key={`${r.county}/${r.ward}`} type="button" disabled={disabled} onClick={() => toggle(r.ward)}
                  className={cx('flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60',
                    on ? 'border-primary bg-primary-050' : 'border-border bg-surface hover:border-border-strong')}>
                  <span className="flex min-w-0 flex-col">
                    <span className={cx('truncate text-[12px] font-semibold', on ? 'text-primary' : 'text-ink')}>{r.ward}</span>
                    {r.county && <span className="truncate text-[10px] text-muted">{r.county}</span>}
                  </span>
                  <span className={cx('shrink-0 text-[11px] font-bold', on ? 'text-primary' : 'text-ink-2')}>{n0(r.reach)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-md bg-surface px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Users size={16} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-head text-xl font-extrabold leading-tight text-ink">{!audience && loading ? '—' : n0(audience?.reach ?? 0)}</span>
          <span className="text-[11px] text-ink-2">
            {picked.length
              ? `can be reached on ${meta.short} in ${picked.length === 1 ? 'this ward' : `these ${picked.length} wards`}`
              : `can be reached on ${meta.short} — every ward${value.county ? ` in ${value.county}` : ''}`}
            {loading ? ' · updating…' : ''}
          </span>
        </span>
      </div>
      {audience && audience.missing.length > 0 && <span className="text-[11px] text-warning">No one to reach on {meta.short} in {audience.missing.join(', ')} yet.</span>}
      <p className="m-0 text-[11px] text-muted">
        Counted from UKO accounts registered in these wards with a working {channel === 'email' ? 'e-mail address' : 'Kenyan mobile number'}. Anyone who has switched marketing
        messages off in their account is never counted and never messaged.
      </p>
    </div>
  )
}

export function MessagingSection({ onGoPackages }: { onGoPackages: () => void }) {
  const [channel, setChannel] = useState<MessagingChannel>('email')
  const [loaded, setLoaded] = useState<{ channel: MessagingChannel; data: CampaignsData } | null>(null)
  const [loadErr, setLoadErr] = useState('')

  const load = async (c: MessagingChannel = channel) => {
    try {
      const data = await api.get<CampaignsData>('/seller/campaigns', { channel: c })
      setLoaded({ channel: c, data })
      setLoadErr('')
    } catch (e: any) {
      setLoadErr(e.message || 'Could not load messaging')
    }
  }
  useEffect(() => {
    load(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  // Campaigns are delivered by a worker on the API (app/tasks.py), not while the request is open — follow the
  // queued ones until they report back so History, the progress count and the unit balance settle on their own.
  const inFlight = !!loaded?.data.campaigns.some((c) => isSending(c.status))
  const shown = loaded?.channel
  useEffect(() => {
    if (!inFlight || !shown) return
    const t = setInterval(() => load(shown), POLL_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight, shown])

  if (loadErr && !loaded) {
    return <Notice tone="warning" title="Messaging unavailable" action={<Button size="sm" variant="outline" onClick={() => load()}>Retry</Button>}>{loadErr}</Notice>
  }
  if (!loaded) return <PageLoading />
  const units = Object.values(loaded.data.balances || {}).reduce((a, b) => a + Number(b || 0), 0)
  if (!loaded.data.has_package && units <= 0) {
    return (
      <Panel>
        <EmptyState
          icon={<Lock size={26} />}
          tag="Pay-per-use messaging"
          title="Buy a messaging package to start"
          sub="Buy a messaging package to send e-mail, SMS and WhatsApp messages to your buyers and post your ads on UKOshop's X, Facebook and Instagram accounts. You only pay for what you send — no subscription, and your units never expire."
          action={<Button icon={<Crown size={15} />} onClick={onGoPackages}>See messaging packages</Button>}
        />
      </Panel>
    )
  }
  const data = loaded.channel === channel ? loaded.data : null
  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={MSG_CHANNELS.map((c) => ({ key: c.key, label: c.label }))} value={channel} onChange={setChannel} />
      <ChannelPage
        key={channel}
        channel={channel}
        data={data}
        reload={() => load(channel)}
        onBalance={(balance) => setLoaded((l) => (l ? { ...l, data: { ...l.data, balances: { ...l.data.balances, [channel]: balance } } } : l))}
        onGoPackages={onGoPackages}
      />
    </div>
  )
}

/** One image, video or audio file sent with a WhatsApp campaign. Uploaded straight away so the API only ever
 *  receives a stored path, which it signs into a URL Meta fetches when the message goes out.
 *  An attachment rides a template header when one is approved for its kind; otherwise it goes out free-form, which
 *  Meta delivers only inside the buyer's 24 h window. Audio is never allowed in a template header and carries no
 *  caption on the Cloud API, so an audio file always goes out free-form and on its own. */
function AttachmentPicker({ value, onChange, rules }: { value: Attachment | null; onChange: (a: Attachment | null) => void; rules?: WhatsAppMedia }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const maxOf = (k: MediaKind) => Number(rules?.max_mb?.[k] ?? 5)
  /** Whether an approved template header can carry this kind — if not, the message is free-form (24 h window only). */
  const templated = (k: MediaKind) => Boolean(rules?.template) && (rules?.template_types ?? ['image', 'video']).includes(k)
  const pick = async (f: File | undefined) => {
    if (!f) return
    setErr('')
    const kind: MediaKind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'image'
    const max = maxOf(kind)
    if (f.size > max * 1024 * 1024) return setErr(`WhatsApp ${kind} files have to be under ${max} MB — this one is ${(f.size / 1024 / 1024).toFixed(1)} MB`)
    setBusy(true)
    try {
      const r = await api.upload(f, 'user')
      onChange({ path: r.path, url: r.url, type: r.kind })
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-ink-2">Attachment (optional)</span>
      <input ref={input} type="file" accept="image/*,video/*,audio/*" hidden onChange={(e) => { pick(e.target.files?.[0] || undefined); e.target.value = '' }} />
      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2.5">
          {value.type === 'image' ? (
            <img src={value.url} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
          ) : value.type === 'video' ? (
            <video src={value.url} className="h-16 w-16 shrink-0 rounded object-cover" muted />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-surface-2 text-ink-2"><Music size={20} /></span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-ink">
              {(() => { const Icon = MEDIA_ICON[value.type]; return <Icon size={13} className="text-muted" /> })()}
              {value.type[0].toUpperCase()}{value.type.slice(1)} attached
            </span>
            {value.type === 'audio' && <audio src={value.url} controls className="h-8 w-full" />}
          </div>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-full bg-ink/70 p-1 text-white" aria-label="Remove attachment"><X size={12} /></button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" loading={busy} icon={<Paperclip size={14} />} onClick={() => input.current?.click()}>Add image, video or audio</Button>
      )}
      {err && <span className="text-xs text-danger">{err}</span>}
      <span className="text-[11px] text-muted">
        Goes out with the message · image up to {maxOf('image')} MB, video {maxOf('video')} MB, audio {maxOf('audio')} MB
        {value && !templated(value.type)
          ? value.type === 'audio'
            ? ' · WhatsApp sends audio on its own, without your message text, and only to buyers who messaged you in the last 24 hours'
            : ' · this attachment only reaches buyers who messaged you in the last 24 hours until a media template is approved'
          : ''}
      </span>
    </div>
  )
}

function ChannelPage({ channel, data, reload, onBalance, onGoPackages }: { channel: MessagingChannel; data: CampaignsData | null; reload: () => Promise<void>; onBalance: (balance: number) => void; onGoPackages: () => void }) {
  const toast = useToast()
  const { user } = useAuth()
  const meta = channelMeta(channel)
  const social = isSocialChannel(channel)
  const phones = channel === 'sms' || channel === 'whatsapp'
  const [items, setItems] = useState<ItemCard[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [itemId, setItemId] = useState('')
  const [contacts, setContacts] = useState('')
  // bulk targeting: the wards the seller is aiming at and how many messages they want to send into them
  const [mode, setMode] = useState<AudienceMode>('buyers')
  const [targeting, setTargeting] = useState<Targeting>(emptyTargeting)
  const [quantity, setQuantity] = useState('')
  const [media, setMedia] = useState<Attachment | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [accept, setAccept] = useState(false)

  useEffect(() => {
    api.get<{ items: ItemCard[] }>('/seller/items', { status: 'live', page: 1, per_page: 50 }).then((r) => setItems(r.items)).catch(() => setItems([]))
  }, [])

  // open on the wards the seller's package was bought for — they paid to reach those, so that is the sensible default
  const bought = data?.targeting
  const boughtKey = `${bought?.country || ''}|${bought?.county || ''}|${(bought?.wards || []).join(',')}`
  useEffect(() => {
    if (bought && (bought.wards?.length || bought.county)) setTargeting({ ...emptyTargeting(), ...bought })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boughtKey])

  const contactList = splitContacts(contacts)
  const isPush = channel === 'push'
  // push reaches accounts, not typed-in contacts, so it has no "My own list"
  const modes = isPush ? AUDIENCE_MODES.filter((m) => m.key !== 'contacts') : AUDIENCE_MODES
  const buyerCount = data?.buyer_reach?.[channel] ?? data?.audience_size ?? 0
  const bulk = !social && isBulkChannel(channel)
  const { audience: reachData, loading: reaching, err: reachErr } = useAudience(bulk && mode === 'wards' ? channel : null, targeting)
  // `sendable` is the reach capped at what one campaign may carry (WhatsApp has Meta's lower 24 h ceiling)
  const sendable = reachData?.sendable ?? 0
  const wanted = Math.max(0, Math.floor(Number(quantity) || 0))
  const bulkRecipients = Math.min(wanted || sendable, sendable)
  const maxPerCampaign = reachData?.max_per_campaign ?? data?.bulk?.max_per_campaign ?? 0
  const cappedByMeta = !!reachData && reachData.reach > reachData.sendable
  // a quantity the seller has not touched follows the reach, so the field always opens on "everyone we can reach"
  useEffect(() => {
    if (mode === 'wards' && reachData) setQuantity((q) => (q === '' ? String(reachData.sendable) : q))
  }, [mode, reachData])
  const delivery: Delivery = data?.delivery?.[channel] ?? 'simulated'
  // social posts go out on UKOshop's own account for this channel
  const account = social ? data?.accounts?.[channel as SocialProvider] : undefined
  const policy = data?.social_policy
  const maxRecipients = data?.max_recipients ?? 100
  const tooMany = contactList.length > maxRecipients
  const item = items.find((i) => String(i.id) === itemId)

  // units this send needs — email / WhatsApp 1 per recipient, SMS 1 per recipient per part (the “UKO: store” line + link included), social 1 per post
  const recipients = social ? 1 : mode === 'wards' ? bulkRecipients : mode === 'contacts' ? contactList.length : buyerCount
  // WhatsApp is written in CKEditor, so the body is HTML here and plain WhatsApp markup everywhere else
  const messageText = channel === 'whatsapp' ? htmlToWhatsApp(body) : body.trim()
  const storeName = user?.profile.store_name || user?.name || ''
  const adLink = item ? `${typeof window !== 'undefined' ? window.location.origin : ''}/items/${item.id}` : ''
  // the API is the source of truth for the sender line (app/messaging.py sms_from); fall back to the same format
  const smsFrom = data?.sms_sender || `UKO: ${storeName}`
  const smsText = `${smsFrom}\n${body.trim()}${adLink ? ` ${adLink}` : ''}`
  const parts = channel === 'sms' ? smsParts(smsText) : 1
  // mirrors the API's whatsapp_text(): the store name in bold, the message, then the ad link
  const whatsappText = `*${storeName}*
${messageText}${adLink ? `

${adLink}` : ''}`
  // exactly what is published on UKOshop's account: the message, a blank line, then the store signature + ad link
  const socialText = `${body.trim()}\n\n— ${storeName} on UKOshop${adLink ? ` ${adLink}` : ''}`
  const xLength = xChars(socialText)
  const unitsNeeded = recipients * parts
  const unitPrice = Number(data?.unit_prices?.[channel] ?? 0)
  const balance = Number(data?.balances?.[channel] ?? 0)
  const short = !!data && (balance <= 0 || unitsNeeded > balance)
  const plural = (n: number, one: string, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`

  const send = async () => {
    setErr('')
    if (isPush && messageText.length > 300) return setErr('Push notifications are limited to 300 characters')
    if (!messageText) return setErr(channel === 'email' ? 'Write the email body first' : social ? 'Write the post first' : 'Write the message first')
    if (channel === 'email' && !subject.trim()) return setErr('Add a subject line')
    if (mode === 'wards' && !bulkRecipients) return setErr(reaching ? 'Still counting your audience — try again in a moment' : 'No one to message in those wards yet — pick more wards')
    if (mode === 'contacts' && !contactList.length) return setErr(`Add at least one ${channel === 'email' ? 'e-mail address' : 'phone number'}`)
    if (mode === 'buyers' && !social && !buyerCount) return setErr(isPush ? 'None of your past buyers has turned push on yet — target wards, or use e-mail or SMS' : 'You have no past buyers to message yet — target wards instead, or add your own list')
    if (mode === 'contacts' && tooMany) return setErr(`Up to ${maxRecipients} contacts per message`)
    if (channel === 'twitter' && xLength > 280) return setErr(`X posts are limited to 280 characters (this one is about ${xLength} with your store name${item ? ' and the ad link' : ''})`)
    if (channel === 'instagram' && account?.configured && !item) return setErr('Attach an ad with a photo — Instagram posts need an image')
    if (social && !accept) return setErr('Tick the box to agree to the posting rules first')
    if (short) return setErr(`This needs ${plural(unitsNeeded, `${meta.short} unit`)} and you have ${n0(balance)} — buy a messaging package`)
    setBusy(true)
    try {
      const r = await api.post<SentCampaign>('/seller/campaigns', {
        channel, subject: channel === 'email' ? subject.trim() : '', body: messageText, item_id: itemId ? Number(itemId) : null,
        ...(channel === 'whatsapp' && media ? { media: media.path, media_type: media.type } : {}),
        audience: social ? 'followers' : mode === 'wards' ? 'wards' : mode === 'contacts' ? 'contacts' : 'interested_buyers',
        recipients: !social && mode === 'contacts' ? contactList : [],
        ...(mode === 'wards' && !social
          ? { wards: targeting.wards || [], quantity: bulkRecipients, county: targeting.county || '', country: targeting.country || '' }
          : {}),
        ...(social ? { accept_policy: true } : {}),
      })
      // The API queues the campaign and delivers it in the background, so there is no result yet — History follows it.
      const queued = Number(r.stats?.total ?? (social ? 1 : recipients))
      const who = r.audience === 'contacts' ? 'contact' : r.audience === 'wards' ? 'person' : 'buyer'
      toast.success(social
        ? `Queued — the post goes up on UKOshop's ${meta.short}${account?.name ? ` (${account.name})` : ''} in a moment`
        : `Sending ${meta.noun}${queued === 1 ? '' : 's'} to ${plural(queued, who)} — you can leave this page, the result appears under History`)
      if (typeof r.balance === 'number') onBalance(r.balance)
      setBody(''); setSubject(''); setItemId(''); setAccept(false); setMedia(null)
      await reload()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const audienceLine = !data
    ? 'Checking your audience…'
    : social
      ? `Audience: UKOshop's followers on ${meta.short}`
      : mode === 'wards'
        ? `Audience: ${plural(bulkRecipients, 'person', 'people')}${targeting.wards?.length ? ` in ${plural(targeting.wards.length, 'ward')}` : ' across every ward'}${reaching ? ' · counting…' : ''}`
        : mode === 'contacts'
          ? `Audience: ${plural(contactList.length, 'contact')} you added`
          : `Audience: ${plural(buyerCount, 'buyer')} — ${isPush ? 'past buyers who turned push on and allow offers' : 'everyone who has bought from you and allows offers'}`
  const deliveryNote = isPush
    ? delivery === 'live'
      ? 'Live: each buyer gets one push on every phone or browser where they turned UKOshop push on. You never see who they are, and a buyer who switched marketing push off is skipped and not charged.'
      : 'Push is simulated. Web push keys are not set on the server, so nothing is sent and no units are used.'
    : social
    ? delivery === 'live'
      ? `Live: the post is published on UKOshop's ${meta.short} account${account?.name ? ` (${account.name})` : ''} with your store name${item ? ' and ad link' : ''}.`
      : `Posting is simulated — UKOshop's ${meta.short} keys aren't set on the server, so nothing is published and no units are used.`
    : delivery === 'live'
      ? channel === 'whatsapp'
        ? 'Live: every WhatsApp message is sent on the WhatsApp Business platform (Meta), one message per contact. Sending runs in the background — you can leave this page while it works through your list.'
        : `Live: every ${meta.noun} is really sent through UKO's ${channel === 'email' ? 'e-mail (SMTP)' : "SMS (Africa's Talking)"} gateway, one message per contact. Sending runs in the background — you can leave this page while it works through your list.`
      : delivery === 'sandbox'
        ? "Africa's Talking sandbox: messages reach the AT simulator only, not real phones, until live SMS keys are set."
        : `Delivery is simulated — ${channel === 'email' ? 'the SMTP gateway' : channel === 'sms' ? 'the SMS gateway' : 'the WhatsApp Business gateway'} is not configured, so nothing goes out and no units are used.`

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Panel title={meta.label} sub={audienceLine}>
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); send() }}>
          {social && data && (
            <Notice tone={account && !account.configured ? 'info' : 'success'} icon={<meta.Icon size={15} />} title={`Posting to UKOshop on ${meta.short} — ${account?.name || 'UKOshop'}`}>
              Posts from every seller are published on UKOshop's {meta.short} account with your store name and ad link{channel === 'instagram' ? ' (Instagram also posts your ad’s first photo)' : ''}.
              {account && !account.configured && ' Simulated — the keys aren’t set on the server yet, so nothing is published and no units are used.'}
            </Notice>
          )}
          {!social && (
            <div className="flex flex-col gap-3">
              {bulk && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink-2">Who gets this {meta.noun}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {modes.map((m) => (
                      <Chip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>
                        <span className="flex items-center gap-1.5"><m.Icon size={12} /> {m.label}</span>
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              {bulk && mode === 'wards' && (
                <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
                  <WardTargeting channel={channel as BulkChannel} value={targeting} onChange={setTargeting} audience={reachData} loading={reaching} />
                  {reachErr && <Notice tone="danger">{reachErr}</Notice>}
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={sendable || undefined}
                    step={1}
                    label={`How many ${meta.units} do you want to send?`}
                    placeholder={String(sendable || 0)}
                    leading={<Target size={14} />}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
                    hint={sendable
                      ? `Up to ${n0(sendable)} · ${wanted > sendable ? `only ${n0(sendable)} can be reached, so that is what goes out` : `${plural(bulkRecipients, 'message')} will go out, picked at random across the wards you chose`}`
                      : 'Pick wards with people in them first'}
                  />
                  {cappedByMeta && (
                    <span className="text-[11px] text-warning">
                      {n0(reachData!.reach)} can be reached, but one {meta.short} campaign carries at most {n0(maxPerCampaign)}
                      {channel === 'whatsapp' ? " — Meta's limit for a business that is not verified yet" : ''}. Send the rest in another campaign; your units keep.
                    </span>
                  )}
                </div>
              )}
              {(!bulk || mode === 'contacts') && (
                <Textarea
                  label={channel === 'email' ? 'Contacts (e-mail addresses)' : 'Contacts (phone numbers)'}
                  rows={2}
                  placeholder={channel === 'email' ? 'jane@gmail.com, peter@yahoo.com' : '0712 345 678, 0733 456 789'}
                  value={contacts}
                  onChange={(e) => setContacts(e.target.value)}
                  hint={`Separate with commas or new lines · ${contactList.length} added · up to ${maxRecipients}${bulk ? '' : ' · leave empty to message your past buyers'}`}
                  error={tooMany ? `Up to ${maxRecipients} contacts per message` : undefined}
                />
              )}
              {bulk && mode === 'buyers' && (
                <Notice tone="info" icon={<Store size={15} />}>
                  Going to {plural(buyerCount, 'buyer')} who have ordered from you{isPush ? ' and turned push on' : ''}. Pick <strong>Target wards</strong> to reach UKO accounts in a ward instead.
                </Notice>
              )}
            </div>
          )}
          {channel === 'email' && <Input label="Subject" placeholder="e.g. New stock just landed at the shelf" value={subject} onChange={(e) => setSubject(e.target.value)} />}
          {channel === 'whatsapp' ? (
            <RichEditor
              label="Message"
              variant="message"
              value={body}
              onChange={setBody}
              max={1024}
              placeholder="Your store name is added at the top of the message"
              hint="Bold, italic, strikethrough, lists and links are the formatting WhatsApp shows — anything else is sent as plain text"
            />
          ) : (
            <Textarea
              label={channel === 'email' ? 'Message' : phones ? 'Text message' : isPush ? 'Notification text' : 'Post'}
              rows={channel === 'sms' || isPush ? 3 : 5}
              placeholder={isPush ? 'e.g. New stock at the Kilimani shelf, 10% off this week' : channel === 'sms' ? 'Short and clear — the buyer sees “UKO: your store name” first' : social ? 'What do you want to say about your ad?' : 'Write to the buyers who have bought from you before…'}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              hint={isPush ? `Your store name is the title · ${body.trim().length}/300 characters, phones show about the first 120 · tapping it opens ${item ? 'the ad' : 'UKOshop'}` : channel === 'sms' ? `Sent as “${smsFrom}” · about ${smsText.length} characters with that line${item ? ' and the ad link' : ''} · ${plural(parts, 'SMS part')} per recipient${parts > 1 ? ' — long messages are split and each part uses a unit' : ''}` : channel === 'twitter' ? `About ${xLength}/280 characters with your store name${item ? ' and the ad link (links count as 23)' : ''}` : undefined}
              error={channel === 'twitter' && xLength > 280 ? `${xLength - 280} over the X limit` : isPush && body.trim().length > 300 ? `${body.trim().length - 300} over the 300-character limit` : undefined}
            />
          )}
          {channel === 'whatsapp' && <AttachmentPicker value={media} onChange={setMedia} rules={data?.whatsapp_media} />}
          <Select
            label={channel === 'instagram' ? 'Attach an ad (needed for Instagram)' : 'Attach an ad (optional)'}
            placeholder="No ad attached"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            hint={channel === 'instagram' ? 'Instagram posts need an ad with a photo — its first photo is posted with your caption' : social ? 'Adds a link to the ad page to the post' : 'Adds a link to the ad page at the end of the message'}
          >
            {items.map((it) => <option key={it.id} value={String(it.id)}>{it.title} · {ksh(it.min_amount)}</option>)}
          </Select>

          {channel === 'whatsapp' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-2">Preview · what the buyer receives</span>
              <p className={cx('m-0 whitespace-pre-wrap break-words rounded-md border border-border bg-surface px-3.5 py-3 text-[13px] leading-[1.5]', messageText ? 'text-ink' : 'text-muted')}>
                {messageText ? whatsappText : `*${storeName}*
Your message appears here…${adLink ? `

${adLink}` : ''}`}
              </p>
            </div>
          )}
          {isPush && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-2">Preview · what the buyer's phone shows</span>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><BellRing size={16} /></span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold text-ink">{storeName || 'Your store'}</span>
                  <span className={cx('line-clamp-2 break-words text-[12.5px] leading-snug', body.trim() ? 'text-ink-2' : 'text-muted')}>{body.trim() || 'Your message appears here…'}</span>
                </span>
              </div>
            </div>
          )}
          {social && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-2">Preview · what is published on UKOshop's {meta.short}</span>
              <p className={cx('m-0 whitespace-pre-wrap break-words rounded-md border border-border bg-surface px-3.5 py-3 text-[13px] leading-[1.5]', messageText ? 'text-ink' : 'text-muted')}>
                {messageText ? socialText : `Your post appears here…\n\n— ${storeName} on UKOshop${adLink ? ` ${adLink}` : ''}`}
              </p>
            </div>
          )}

          {data && (
            <div className="flex flex-col gap-1.5 rounded-md bg-surface px-3.5 py-3">
              <div className="flex items-center justify-between gap-3 text-[11px] text-ink-2">
                <span>{social ? '1 post' : `${plural(recipients, 'recipient')}${mode === 'wards' && !social ? ' in your wards' : ''}${channel === 'sms' ? ` × ${plural(parts, 'SMS part')}` : ''}`}</span>
                <span>{plural(unitsNeeded, 'unit')}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-ink-2"><span>Price per {meta.unit}</span><span>{kshCents(unitPrice)}</span></div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2">
                <span className="text-xs font-semibold text-ink-2">{channel === 'sms' || (!social && !contactList.length) ? 'About' : 'Units worth'}</span>
                <span className="font-head text-lg font-extrabold text-ink">{kshCents(unitsNeeded * unitPrice)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted">
                <span>{meta.short} balance · {plural(balance, 'unit')}</span>
                <span>{short ? 'not enough units' : `${plural(balance - unitsNeeded, 'unit')} left after sending`}</span>
              </div>
              <span className="text-[10px] text-muted">These units are held when you send and charged as the messages go out — simulated and failed ones are free, and whatever is left over comes straight back to your balance.</span>
            </div>
          )}
          {short && (
            <Notice tone="warning" icon={<Crown size={15} />} action={<Button size="sm" variant="outline" onClick={onGoPackages}>Buy units</Button>}>
              {balance <= 0 ? `You have no ${meta.short} units left.` : `This needs ${plural(unitsNeeded, 'unit')} and you have ${n0(balance)}.`} Buy a messaging package to top up — units never expire.
            </Notice>
          )}
          {social && data && (
            <div className="flex flex-col gap-3">
              {policy?.text && <Notice tone="warning" title="Before you post">{policy.text}</Notice>}
              <Checkbox
                checked={accept}
                onChange={setAccept}
                label={<span className="text-[12px] leading-relaxed">I agree — this post is respectful and about buying and selling, and UKO may withdraw it if flagged</span>}
              />
            </div>
          )}
          {err && <Notice tone="danger">{err}</Notice>}
          <Button type="submit" loading={busy} disabled={!data || short || tooMany || (social && !accept) || (mode === 'wards' && !bulkRecipients)} icon={<Send size={15} />}>{meta.verb}</Button>
          <p className="m-0 text-[11px] text-muted">{deliveryNote}</p>
          {mode === 'wards' && !social && (
            <p className="m-0 text-[11px] text-muted">
              These people have not bought from you, so every message opens with your store name and
              {channel === 'email' ? ' says how to switch marketing messages off' : ' points back to your UKO store'}. Keep it about what you are selling — accounts that switch
              marketing off leave your reach for good.
            </p>
          )}
        </form>
      </Panel>

      <Panel title="History" sub={`Past ${social ? 'posts' : `${meta.noun}s`} from this page`} padded={false}>
        {!data ? (
          <div className="p-5"><PageLoading /></div>
        ) : data.campaigns.length === 0 ? (
          <div className="p-5"><EmptyState icon={<meta.Icon size={26} />} title={`No ${social ? 'posts' : `${meta.noun}s`} yet`} sub="Everything you send from this page is kept here with its reach and the units it used." /></div>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {data.campaigns.map((c) => {
              const st = c.stats || {}
              const sent = Number(st.sent ?? 0)
              const failed = Number(st.failed ?? 0)
              const used = Number(st.units ?? 0)
              const withdrawn = c.status === 'withdrawn'
              const sending = isSending(c.status)
              const total = Number(st.total ?? c.recipients.length ?? 0)
              const done = Number(st.done ?? 0)
              const url: string | undefined = social && !withdrawn ? st.results?.[0]?.url : undefined
              // the channel itself was down (no credits, keys, permission or a provider outage) — not something the seller wrote wrong
              const unavailable = Boolean(social && c.status === 'failed' && st.results?.[0]?.unavailable)
              const excerpt = c.body.length > 110 ? `${c.body.slice(0, 110)}…` : c.body
              return (
                <li key={c.id} className="flex flex-col gap-1.5 px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">{c.subject || excerpt}</span>
                    <span className="shrink-0 text-[11px] text-muted">{fmtDate(c.created_at)}</span>
                  </div>
                  {c.subject && <p className="m-0 text-[12px] leading-[1.5] text-ink-2">{excerpt}</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {sending
                      ? <Chip size="sm" tone="primary">{c.status === 'queued' ? 'Queued…' : social ? 'Posting…' : `Sending… ${n0(done)}/${n0(total)}`}</Chip>
                      : social ? (withdrawn ? <Chip size="sm" tone="danger">Withdrawn</Chip> : c.status === 'failed' ? <Chip size="sm" tone={unavailable ? 'warning' : 'danger'}>{unavailable ? 'Not posted yet' : 'Not posted'}</Chip> : <Chip size="sm" tone="success">Posted</Chip>) : <Chip size="sm" tone="success">{sent} sent</Chip>}
                    {social && <Chip size="sm">UKOshop account</Chip>}
                    {c.audience === 'wards' && (
                      <Chip size="sm" tone="secondary">
                        {Array.isArray(st.wards) && st.wards.length ? (st.wards.length === 1 ? st.wards[0] : `${st.wards.length} wards`) : 'All wards'}
                      </Chip>
                    )}
                    {!social && failed > 0 && <Chip size="sm" tone="danger">{failed} failed</Chip>}
                    {st.simulated && <Chip size="sm">Simulated</Chip>}
                    {used > 0 && <Chip size="sm" tone="primary">{plural(used, 'unit')}</Chip>}
                    {c.item_id && <Chip size="sm">Ad #{c.item_id}</Chip>}
                    {c.media_type && <Chip size="sm">{c.media_type[0].toUpperCase()}{c.media_type.slice(1)} attached</Chip>}
                    {!withdrawn && !sending && <StatusPill status={c.status} />}
                    {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">View post <ExternalLink size={11} /></a>}
                  </div>
                  {social && withdrawn && <span className="text-[11px] text-danger">Withdrawn by UKO{st.withdrawn?.reason ? ` — ${st.withdrawn.reason}` : ' after it was flagged'}</span>}
                  {social && c.status === 'failed' && st.results?.[0]?.error && <span className={`text-[11px] ${unavailable ? 'text-warning' : 'text-danger'}`}>{st.results[0].error}</span>}
                  {sending && <span className="text-[11px] text-muted">Being sent now — {social ? 'this page updates when it is posted' : 'this page updates on its own as messages go out'}</span>}
                  {!social && c.status === 'failed' && st.error && <span className="text-[11px] text-danger">{st.error}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
