import { useEffect, useState, type ReactNode } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftRight, Banknote, Bike, ChevronDown, MapPin, Package, Phone, QrCode, Search, Star, Store, TriangleAlert, Wallet } from 'lucide-react'
import { api, type Bid, type Order } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh, STATUS_LABEL, timeAgo } from '#/lib/format'
import { Button, Chip, CodeDigits, EmptyState, Input, LinkButton, Notice, PageLoading, StatusPill, cx } from '#/components/ui'
import { Thumb } from '#/components/media'
import { OrderChat } from '#/components/order-chat'

export const Route = createFileRoute('/orders/')({ component: OrdersPage })

type TabKey = 'all' | 'unpaid' | 'processing' | 'shipped' | 'ready' | 'completed' | 'cancelled' | 'returned' | 'direct' | 'shelve'
type Resp = { orders: Order[]; counts: Partial<Record<TabKey, number>> }

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'ready', label: 'Ready at shelf' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'returned', label: 'Returned' },
  { key: 'direct', label: 'Sold by seller directly' },
  { key: 'shelve', label: 'Sold from shelve' },
]

const EMPTY: Record<TabKey, { title: string; sub: string }> = {
  all: { title: 'No orders yet', sub: 'Everything you buy from shelves or directly from sellers will show up here.' },
  unpaid: { title: 'Nothing waiting for payment', sub: 'Orders you place but have not paid for yet will appear here.' },
  processing: { title: 'Nothing in processing', sub: 'Paid orders being checked at the shelf will appear here.' },
  shipped: { title: 'Nothing on the way', sub: 'Orders that a rider has picked up will appear here.' },
  ready: { title: 'Nothing waiting at a shelf', sub: 'Orders ready for you to claim with your ID will appear here.' },
  completed: { title: 'No completed orders yet', sub: 'Claimed and delivered orders will appear here.' },
  cancelled: { title: 'No cancelled orders', sub: 'Orders you cancel before pickup will appear here.' },
  returned: { title: 'No returned orders', sub: 'Orders the seller or shelf sent back to you will appear here.' },
  direct: { title: 'No direct purchases', sub: 'Items you arrange to buy straight from a seller will appear here.' },
  shelve: { title: 'No shelf purchases yet', sub: 'Orders held or delivered from a UKO shelf will appear here.' },
}

// Labels for statuses the shared STATUS_LABEL map does not know about yet
const LABEL: Record<string, string> = { ...STATUS_LABEL, returned: 'Returned', direct: 'Sold by seller directly' }
/** What a single line's standing is called on the buyer's side. */
const ITEM_STATUS: Record<string, string> = { cancelled: 'Cancelled', returned: 'Returned', accepted: 'Accepted' }

const BID_STATUS_LABEL: Record<Bid['status'], string> = {
  pending: 'Waiting for seller', accepted: 'Accepted', declined: 'Declined', awaiting_inspection: 'Awaiting inspection',
  inspected: 'Inspected', rejected_inspection: 'Failed inspection', completed: 'Completed', cancelled: 'Withdrawn',
}
const BID_STATUS_TONE: Record<Bid['status'], string> = {
  pending: 'pending', accepted: 'accepted', declined: 'rejected', awaiting_inspection: 'processing', inspected: 'approved',
  rejected_inspection: 'rejected', completed: 'completed', cancelled: 'cancelled',
}
const OFFER_LABEL: Record<Bid['offer_type'], string> = { item: 'Item for item', item_cash: 'Item + cash', item_service: 'Item + service', service: 'Service', cash_service: 'Cash + service' }

function offerSummary(b: Bid): string {
  const parts: string[] = []
  if (b.offered_item) parts.push(b.offered_item)
  if (b.offered_service) parts.push(b.offered_service)
  if (b.cash_amount > 0) parts.push(`+ ${ksh(b.cash_amount)}`)
  return parts.join(' · ') || OFFER_LABEL[b.offer_type] || b.offer_type
}

/** "Barter · Item + cash · My old phone" → "Item + cash · My old phone" */
function barterSummary(o: Order): string {
  return (o.notes || '').replace(/^Barter\s*·\s*/i, '').trim()
}

// Anchor styled like Button (external / tel: links)
const A_BASE = 'inline-flex w-full items-center justify-center gap-2 rounded-md px-3.5 py-[11px] text-[13px] font-semibold leading-none transition-colors'
const A_PRIMARY = 'border border-primary bg-primary text-white hover:bg-primary-600'
const A_OUTLINE = 'border border-border-strong bg-transparent text-ink hover:bg-surface'
const A_DISABLED = 'pointer-events-none opacity-60'

function OrdersPage() {
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<TabKey>('all')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [shown, setShown] = useState<Record<number, boolean>>({})
  const [bids, setBids] = useState<Bid[] | null>(null)
  const [bidsOpen, setBidsOpen] = useState(true)
  const [bidBusy, setBidBusy] = useState<number | null>(null)

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: '/orders' } })
  }, [ready, user, navigate])

  useEffect(() => {
    if (!user) return
    api.get<Bid[]>('/bids').then(setBids).catch(() => setBids([]))
  }, [user])

  const cancelBid = async (b: Bid) => {
    setBidBusy(b.id)
    try {
      const updated = await api.post<Bid>(`/bids/${b.id}/decide`, { decision: 'cancel' })
      setBids((list) => (list ? list.map((x) => (x.id === b.id ? updated : x)) : list))
      toast.success(`Your bid on ${b.item?.title || 'the item'} was withdrawn`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBidBusy(null)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setData(await api.get<Resp>('/orders', { status: tab, q: query }))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (user) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab, query])

  /** Cancel one item of an order, or all of it. Each line is refunded into the wallet on its own. */
  const cancel = async (o: Order, item?: Order['items'][number]) => {
    const what = item ? item.title : `order ${o.order_no}`
    const back = cancelRefund(o, item)
    const incl = back > 0 && (!item || back > item.amount * item.quantity) ? feesIncluded(o) : ''
    if (!window.confirm(`Cancel ${what}? ${back > 0 ? `You get ${ksh(back)} back${incl ? `, ${incl}` : ''}, in your UKO wallet.` : PAID.includes(o.payment_status) ? 'The money comes back to your UKO wallet.' : 'Nothing has been paid yet.'}`)) return
    setBusy(o.id)
    try {
      await api.post(`/orders/${o.id}/cancel`, { item_id: item?.id })
      toast.success(`${item ? item.title : `Order ${o.order_no}`} cancelled${o.payment_status === 'paid' ? ' — refunded to your wallet' : ''}`)
      await load(true)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (!ready || !user) return <PageLoading />

  const orders = data?.orders || []
  const counts = data?.counts || {}

  return (
    <div className="container-x flex flex-col gap-4 py-5 pb-24 md:gap-[18px] md:py-7 md:pb-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] leading-tight md:text-[26px]">My orders</h1>
          <p className="m-0 text-[13px] text-ink-2">Track everything you bought from shelves or directly from sellers</p>
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order number or item" leading={<Search size={15} />} className="w-full md:w-[280px]" />
      </div>

      {bids && bids.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-border bg-bg">
          <button type="button" onClick={() => setBidsOpen((v) => !v)} aria-expanded={bidsOpen} className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left md:px-[18px]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-050 text-secondary-600"><ArrowLeftRight size={15} /></span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-bold text-ink">My barter bids</span>
              <span className="text-[11px] text-muted">{bids.filter((b) => b.status === 'pending').length} waiting for a seller · {bids.length} total</span>
            </span>
            <ChevronDown size={16} className={cx('shrink-0 text-muted transition-transform', bidsOpen && 'rotate-180')} />
          </button>
          {bidsOpen && (
            <div className="divide-y divide-border">
              {bids.map((b) => (
                <div key={b.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-4 md:px-[18px]">
                  <div className="flex min-w-0 flex-1 items-center gap-[11px]">
                    <Thumb src={b.item?.image || ''} size={44} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {b.item ? (
                        <Link to="/items/$id" params={{ id: String(b.item.id) }} className="truncate text-xs font-semibold text-ink hover:text-primary">{b.item.title}</Link>
                      ) : (
                        <span className="truncate text-xs font-semibold text-ink">Item no longer listed</span>
                      )}
                      <span className="truncate text-[11px] text-ink-2">You offered: {offerSummary(b)}</span>
                      <span className="text-[11px] text-muted">
                        {OFFER_LABEL[b.offer_type] || b.offer_type} · {b.trade_mode === 'shelve' ? `Trade at ${b.shelve?.name || 'a shelf'}${b.shelve_fee ? ` · fee ${ksh(b.shelve_fee)}` : ''}` : 'Direct with seller'} · {timeAgo(b.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <StatusPill status={BID_STATUS_TONE[b.status] || b.status} label={BID_STATUS_LABEL[b.status] || b.status} />
                    {b.status === 'pending' && (
                      <Button variant="outline" size="sm" loading={bidBusy === b.id} onClick={() => cancelBid(b)}>Cancel bid</Button>
                    )}
                    {b.order_id && (b.status === 'accepted' || b.status === 'awaiting_inspection' || b.status === 'inspected' || b.status === 'completed') && (
                      <Link to="/orders/$id/track" params={{ id: String(b.order_id) }} className="text-xs font-semibold text-primary hover:underline">View order</Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {TABS.map((t) => {
          const active = tab === t.key
          const n = counts[t.key]
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-[9px] text-xs font-semibold leading-none transition-colors', active ? 'border-primary bg-primary text-white' : 'border-border bg-bg text-ink-2 hover:border-border-strong hover:text-ink')}>
              {t.label}
              {n !== undefined && n > 0 && <span className={cx('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/20 text-white' : 'bg-surface-2 text-muted')}>{n}</span>}
            </button>
          )
        })}
      </div>

      {loading && !data ? (
        <PageLoading />
      ) : orders.length === 0 ? (
        query ? (
          <EmptyState icon={<Search size={28} />} title={`No orders match “${query}”`} sub="Try the order number (e.g. UKO-48213) or part of the item name." action={<Button variant="outline" onClick={() => setQ('')}>Clear search</Button>} />
        ) : (
          <EmptyState icon={<Package size={28} />} title={EMPTY[tab].title} sub={EMPTY[tab].sub} action={<LinkButton to={'/items' as any}>Browse items</LinkButton>} />
        )
      ) : (
        <div className={cx('flex flex-col gap-4', loading && 'opacity-60')}>
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} busy={busy === o.id} shown={!!shown[o.id]} onToggle={() => setShown((s) => ({ ...s, [o.id]: !s[o.id] }))} onCancel={(item) => cancel(o, item)} onReport={() => toast.success('Thanks — our team will review this seller within 24 hours')} />
          ))}
        </div>
      )}
    </div>
  )
}

function contextLine(o: Order): string {
  const when = timeAgo(o.created_at)
  if (o.is_direct) return `arranged ${when} · Not covered by escrow or shelf verification`
  const d = o.delivery
  if (o.status === 'completed') return `completed ${when}${o.shelve ? ` · ${d ? 'Delivered from' : 'Claimed at'} ${o.shelve.name}` : ''}`
  if (o.status === 'cancelled') return `cancelled · placed ${when}${o.shelve ? ` · ${o.shelve.name}` : ''}`
  if (o.status === 'returned') return `returned · placed ${when}${o.shelve ? ` · ${o.shelve.name}` : ''}`
  if (o.status === 'ready') return `placed ${when}${o.shelve ? ` · ${o.shelve.name}` : ''}${o.hold_until ? ` · claim before ${fmtDate(o.hold_until)}` : ''}`
  if (d && d.rider) return `placed ${when} · rider ${d.rider.name}${d.destination_ward ? ` · ${d.destination_ward}` : ''}${d.eta ? ` · ETA ${d.eta}` : ''}`
  if (d) return `placed ${when}${o.shelve ? ` · ${o.shelve.name}` : ''} · waiting for a rider`
  if (o.status === 'unpaid') return `placed ${when}${o.shelve ? ` · ${o.shelve.name}` : ''} · waiting for payment`
  return `placed ${when}${o.shelve ? ` · ${o.shelve.name}` : ''}`
}

/**
 * What cancelling hands back (terms s. 17). While nothing has moved the buyer gets the whole payment back into his
 * UKO wallet, delivery / shelf fee included — cancelling one item of several refunds just that line, and the last
 * standing line brings the fees back with it. Nothing paid yet → nothing to refund.
 */
const PAID = ['paid', 'released']
function cancelRefund(o: Order, item?: Order['items'][number]): number {
  if (!PAID.includes(o.payment_status)) return 0
  const standing = o.items.filter((i) => i.seller_status === 'accepted')
  if (item && standing.length > 1) return item.amount * item.quantity
  return Math.max(0, o.total - (o.refunded_total || 0))
}
function feesIncluded(o: Order): string {
  return o.delivery_fee > 0 ? 'delivery included' : o.shelve_fee > 0 ? 'shelf fee included' : ''
}
function CancelNote({ order: o }: { order: Order }) {
  const back = cancelRefund(o)
  if (back <= 0) return null
  const incl = feesIncluded(o)
  return <p className="m-0 text-[11px] leading-relaxed text-muted">Cancel now and you get the full {ksh(back)} back{incl ? `, ${incl},` : ''} in your UKO wallet.</p>
}
function NoCancelNote({ order: o }: { order: Order }) {
  return (
    <p className="m-0 text-[11px] leading-relaxed text-muted">
      A rider already has this order, so it can’t be cancelled here.{o.delivery_fee > 0 ? ' The delivery fee is the rider’s for the trip.' : ''}
    </p>
  )
}

const STEPS = ['Packed', 'At shelf', 'Picked up', 'Delivered']
function trackerStep(o: Order): number {
  const s = o.delivery?.status
  if (s === 'delivered') return 3
  if (s === 'picked_up' || s === 'on_the_way') return 2
  if (s === 'offered' || s === 'accepted') return 1
  return 0
}
function trackerText(o: Order): string {
  const d = o.delivery
  const step = trackerStep(o)
  if (step === 3) return 'Delivered · escrow released to the seller'
  if (step === 2) return `Picked up by rider${d?.eta ? ` · ETA ${d.eta}` : ''}`
  if (step === 1) return d?.rider ? `${d.rider.name} accepted · heading to the shelf` : 'At shelf · waiting for a rider'
  return 'Paid & reserved · shelf is checking your item'
}

function mapsHref(o: Order): string {
  const s = o.shelve
  if (!s) return 'https://www.google.com/maps'
  if (s.lat != null && s.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.name, s.address, s.ward].filter(Boolean).join(', '))}`
}

/**
 * The buyer's private codes. Shelf code = shown (with ID) at the shelf / used at the shelf → rider hand-over;
 * rider code = given to the rider only after checking the parcel. claim_code stays as the readable reference.
 */
function CodesBox({ order: o, shown }: { order: Order; shown: boolean }) {
  const byRider = o.delivery_option === 'rider' || o.delivery_option === 'courier'
  const maskedCode = o.claim_code ? o.claim_code.replace(/[A-Za-z0-9]/g, '•') : '••••'
  const digits = (code: string) => (shown ? code : '•'.repeat(code.length || 4))
  return (
    <div className="flex flex-col gap-3 rounded-md bg-success-050 p-3">
      <div className="flex items-center gap-[11px]">
        <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[6px] bg-bg text-ink"><QrCode size={24} /></span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-head text-[13px] font-extrabold text-success">Claim code {shown ? o.claim_code || '—' : maskedCode}</span>
          <span className="text-[10px] leading-[1.4] text-ink-2">Your order reference — known only to you</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold leading-[1.4] text-ink-2">Shelf code — show at {o.shelve?.name || 'the shelf'}</span>
        <CodeDigits value={digits(o.shelve_code || '')} length={o.shelve_code?.length || 4} size="sm" />
      </div>
      {byRider && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold leading-[1.4] text-ink-2">Rider code — give to the rider after checking the parcel</span>
          <CodeDigits value={digits(o.rider_code || '')} length={o.rider_code?.length || 4} size="sm" />
        </div>
      )}
    </div>
  )
}

function TradeChip({ order: o }: { order: Order }) {
  if (o.trade_type === 'barter') {
    const sum = barterSummary(o)
    return (
      <Chip size="sm" tone="secondary" className="max-w-full">
        <ArrowLeftRight size={11} /> <span className="truncate">Barter trade{sum ? ` · ${sum}` : ''}</span>
      </Chip>
    )
  }
  return <Chip size="sm" tone="primary"><Banknote size={11} /> Cash</Chip>
}

function OrderCard({ order: o, busy, shown, onToggle, onCancel, onReport }: { order: Order; busy: boolean; shown: boolean; onToggle: () => void; onCancel: (item?: Order['items'][number]) => void; onReport: () => void }) {
  const status = o.is_direct ? 'direct' : o.status
  const first = o.items[0]
  const d = o.delivery
  const riderPhone = d?.rider?.phone
  const step = trackerStep(o)
  const byRider = o.delivery_option === 'rider' || o.delivery_option === 'courier'

  let side: ReactNode = null
  if (o.is_direct) {
    side = (
      <>
        <Notice tone="warning" icon={<TriangleAlert size={13} />} className="!px-3 !py-2.5">
          <span className="text-[11px] leading-[1.45]">Paid outside UKO — no escrow, no refund cover.</span>
        </Notice>
        <Button variant="outline" size="sm" className="!py-[11px]" onClick={onReport}>Report seller</Button>
      </>
    )
  } else if (o.status === 'ready') {
    side = (
      <>
        <CodesBox order={o} shown={shown} />
        <div className="grid grid-cols-2 gap-2">
          <a href={mapsHref(o)} target="_blank" rel="noreferrer" className={cx(A_BASE, A_PRIMARY)}><MapPin size={14} /> Get directions</a>
          <Button variant="outline" size="sm" className="!py-[11px]" onClick={onToggle}>{shown ? 'Hide codes' : 'Show codes'}</Button>
        </div>
      </>
    )
  } else if (o.status === 'shipped' || o.status === 'processing') {
    side = (
      <>
        {byRider && shown && <CodesBox order={o} shown />}
        <div className="flex flex-col gap-[7px] rounded-md bg-primary-050 p-3">
          <div className="flex items-center gap-1" aria-label={STEPS.map((s, i) => `${s}${i <= step ? ' done' : ''}`).join(', ')}>
            {STEPS.map((s, i) => (
              <span key={s} className="contents">
                <span title={s} className={cx('h-[9px] w-[9px] shrink-0 rounded-full', i <= step ? 'bg-primary' : 'bg-primary-300')} />
                {i < STEPS.length - 1 && <span className={cx('h-0.5 flex-1 rounded-full', i < step ? 'bg-primary' : 'bg-primary-300')} />}
              </span>
            ))}
          </div>
          <span className="text-[11px] font-semibold text-primary-600">{trackerText(o)}</span>
        </div>
        {d ? (
          <div className="grid grid-cols-2 gap-2">
            <Link to="/orders/$id/track" params={{ id: String(o.id) }} className={cx(A_BASE, A_PRIMARY)}><Bike size={14} /> Track delivery</Link>
            <a href={riderPhone ? `tel:${riderPhone}` : undefined} aria-disabled={!riderPhone} className={cx(A_BASE, A_OUTLINE, !riderPhone && A_DISABLED)}><Phone size={14} /> Call rider</a>
            {/* a rider is booked but has not collected yet: nothing has moved, so it can still be cancelled in full */}
            {o.status === 'processing' && step < 2 && <Button variant="outline" size="sm" className="col-span-2 !py-[11px]" loading={busy} onClick={() => onCancel()}>Cancel order</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <span className={cx(A_BASE, A_PRIMARY, A_DISABLED)}>Awaiting shelf</span>
            {o.status === 'processing' && <Button variant="outline" size="sm" className="!py-[11px]" loading={busy} onClick={() => onCancel()}>Cancel order</Button>}
          </div>
        )}
        {/* terms s. 17: the whole payment back while nothing has moved; once a rider has it, no cancelling and the delivery fee is his */}
        {step >= 2 || o.status === 'shipped' ? <NoCancelNote order={o} /> : o.status === 'processing' && <CancelNote order={o} />}
        {byRider && (
          <button type="button" onClick={onToggle} className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-primary hover:underline">
            <QrCode size={12} /> {shown ? 'Hide my codes' : 'Show my shelf & rider codes'}
          </button>
        )}
      </>
    )
  } else if (o.status === 'unpaid') {
    side = (
      <div className="grid grid-cols-2 gap-2">
        <Link to="/checkout/payment" search={{ order: o.id }} className={cx(A_BASE, 'border border-secondary bg-secondary text-white hover:bg-secondary-600')}>Pay now</Link>
        <Button variant="outline" size="sm" className="!py-[11px]" loading={busy} onClick={() => onCancel()}>Cancel order</Button>
        {cancelRefund(o) > 0 && <div className="col-span-2"><CancelNote order={o} /></div>}
      </div>
    )
  } else if (o.status === 'completed') {
    side = (
      <div className="grid grid-cols-2 gap-2">
        {first ? (
          <>
            <Link to="/items/$id" params={{ id: String(first.item_id) }} className={cx(A_BASE, A_PRIMARY)}><Star size={14} /> Rate item</Link>
            <Link to="/items/$id" params={{ id: String(first.item_id) }} className={cx(A_BASE, A_OUTLINE)}>Buy again</Link>
          </>
        ) : (
          <LinkButton to={'/items' as any} variant="outline" size="sm" className="col-span-2">Browse items</LinkButton>
        )}
        {o.trade_type !== 'barter' && (
          <p className="col-span-2 m-0 text-[11px] leading-relaxed text-muted">
            Returning an item? Bring it undamaged to any UKO shelf with order {o.order_no} and your shelf code. The item price is refunded to your UKO wallet — delivery and inspection fees are not refundable. A damaged item is refused and goes back with you.
          </p>
        )}
      </div>
    )
  } else if ((o.status === 'cancelled' || o.status === 'returned') && first) {
    side = (
      <div className="grid grid-cols-2 gap-2">
        <Link to="/items/$id" params={{ id: String(first.item_id) }} className={cx(A_BASE, A_OUTLINE, 'col-span-2')}>Buy again</Link>
      </div>
    )
  }

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-bg">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 md:gap-3.5 md:px-[18px] md:py-[13px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-ink">Order {o.order_no}</span>
            <TradeChip order={o} />
            {o.shelve && !o.is_direct && <Chip size="sm" className="hidden md:inline-flex"><Store size={11} /> {o.shelve.name}</Chip>}
          </div>
          <span className="text-[11px] text-muted">{contextLine(o)}</span>
        </div>
        <StatusPill status={status === 'returned' ? 'rejected' : status} label={LABEL[status]} />
      </div>
      <div className="flex flex-col gap-4 p-4 md:flex-row md:gap-[18px]">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {/* One row per item, each with its own standing: a seller can pull a single line and pay that
              line back without touching the rest of the order. */}
          {o.items.map((it) => {
            const pulled = it.seller_status !== 'accepted'
            const canCancel = !pulled && !o.is_direct && (o.status === 'unpaid' || o.status === 'processing')
            return (
              <div key={it.id} className="flex items-center gap-[11px]">
                <Thumb src={it.image} size={44} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cx('truncate text-xs font-semibold', pulled ? 'text-ink-2 line-through' : 'text-ink')}>{it.title}{it.variant_label ? <span className="font-normal text-ink-2"> · {it.variant_label}</span> : null}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    ×{it.quantity}
                    {pulled && <Chip size="sm" tone={it.seller_status === 'returned' ? 'warning' : 'danger'}>{ITEM_STATUS[it.seller_status]}</Chip>}
                    {it.refund_amount > 0 && <span className="text-success">{ksh(it.refund_amount)} refunded to your wallet</span>}
                    {canCancel && (
                      <button type="button" onClick={() => onCancel(it)} disabled={busy} className="font-semibold text-danger hover:underline disabled:opacity-50">Cancel item</button>
                    )}
                  </span>
                </div>
                <span className={cx('text-xs font-bold', pulled ? 'text-muted line-through' : 'text-ink')}>{ksh(it.amount * it.quantity)}</span>
              </div>
            )
          })}
        </div>
        <div className="flex w-full flex-col gap-2.5 border-t border-border pt-3.5 md:w-[300px] md:border-t-0 md:pt-0">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-2">Order total</span>
            <span className="font-head text-[17px] font-extrabold text-ink">{ksh(o.total)}</span>
          </div>
          {o.refunded_total > 0 && (
            <Link to={'/wallet' as any} className="flex items-center justify-between rounded-md bg-success-050 px-2.5 py-2 text-[11px] font-semibold text-success hover:underline">
              <span className="flex items-center gap-1.5"><Wallet size={12} /> Refunded to your wallet</span>
              <span>{ksh(o.refunded_total)}</span>
            </Link>
          )}
          {side}
          <OrderChat order={o} viewer="buyer" />
        </div>
      </div>
    </article>
  )
}
