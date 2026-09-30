import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Bike, CircleCheck, Package, Store } from 'lucide-react'
import { api, type Order } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useCart } from '#/lib/cart'
import { fmtDate, ksh } from '#/lib/format'
import { CheckoutStepper, CodeDigits, Divider, EmptyState, KeyValue, LinkButton, PageLoading, cx } from '#/components/ui'
import { DELIVERY_LABEL, DOOR_OPTIONS, MiniItem } from '#/components/checkout'

type Search = { order: number }

export const Route = createFileRoute('/checkout/done')({
  validateSearch: (s: Record<string, unknown>): Search => ({ order: Number(s.order) || 0 }),
  component: DonePage,
})

function DonePage() {
  const navigate = useNavigate()
  const { order: id } = Route.useSearch()
  const { user, ready } = useAuth()
  const { refresh } = useCart()
  const [order, setOrder] = useState<Order | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: `/checkout/done?order=${id}` } })
  }, [ready, user, navigate, id])
  useEffect(() => {
    refresh().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!user || !id) return
    api.get<Order>(`/orders/${id}`).then(setOrder).catch((e) => setErr(e.message))
  }, [user, id])

  if (!ready || !user) return <><CheckoutStepper step={4} /><PageLoading /></>
  if (err || !id) return <><CheckoutStepper step={4} /><div className="container-x py-10"><EmptyState icon={<Package size={30} />} title="Order not found" sub={err || 'Missing order reference.'} action={<LinkButton to="/orders">My orders</LinkButton>} /></div></>
  if (!order) return <><CheckoutStepper step={4} /><PageLoading /></>

  const delivery = order.delivery_option !== 'pickup'
  // A rider code is only ever given to a rider at your own door. An order that ends at a shelf is
  // opened with the shelf code instead — nobody should be handed a rider code at a counter.
  const byRider = DOOR_OPTIONS.includes(order.delivery_option)
  const shelfCode = order.shelve_code || order.claim_code.replace(/[^0-9A-Za-z]/g, '').slice(0, 4)
  const shelfName = order.collect_shelve?.name || order.shelve?.name || 'the shelf'

  return (
    <>
      <CheckoutStepper step={4} />
      <div className="container-x py-6 md:py-10">
        <div className="mx-auto flex max-w-[720px] flex-col gap-5">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-bg p-5 text-center md:p-8">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-050 text-success"><CircleCheck size={34} /></span>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl md:text-[28px]">Order {order.order_no} placed</h1>
              <p className="m-0 text-[13px] text-ink-2">
                {order.payment_status === 'paid' ? `Paid with ${order.payment_method === 'mpesa' ? 'M-PESA' : order.payment_method === 'airtel' ? 'Airtel Money' : 'card'} · ${ksh(order.total)} held in escrow` : `Awaiting payment · ${ksh(order.total)}`}
              </p>
            </div>
            <div className={cx('grid w-full gap-3', byRider && 'sm:grid-cols-2')}>
              <div className="flex w-full flex-col items-center gap-3 rounded-md bg-surface p-4">
                <span className="text-xs font-semibold text-ink-2">Shelf code</span>
                <CodeDigits value={shelfCode} length={shelfCode.length || 4} size="lg" />
                <span className="text-[11px] text-ink-2">Show this and your national ID at {shelfName}.</span>
              </div>
              {byRider && (
                <div className="flex w-full flex-col items-center gap-3 rounded-md bg-surface p-4">
                  <span className="text-xs font-semibold text-ink-2">Rider code</span>
                  <CodeDigits value={order.rider_code || ''} length={order.rider_code?.length || 4} size="lg" />
                  <span className="text-[11px] text-ink-2">Give this to the rider only after you have checked the parcel.</span>
                </div>
              )}
            </div>
            <div className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-border-strong px-4 py-3">
              <span className="text-[11px] text-ink-2">Order reference · claim code</span>
              <span className="font-head text-base font-extrabold tracking-wider text-ink">{order.claim_code}</span>
              <span className="text-[11px] text-muted">Both codes are known only to you — never share them before you have your item.</span>
            </div>
            <div className="flex w-full flex-col gap-2.5 text-left">
              <KeyValue label={<span className="flex items-center gap-1.5"><Store size={13} /> {delivery ? 'Held at' : 'Pick up from'}</span>} value={order.shelve ? `${order.shelve.name} · ${order.shelve.ward}` : '—'} />
              {/* An order that ends at a shelf is going somewhere with a name and opening hours — say which
                  shelf, not which estate, because that is where the buyer has to turn up. */}
              <KeyValue
                label={<span className="flex items-center gap-1.5"><Bike size={13} /> Delivery</span>}
                value={!delivery
                  ? 'Collect at each shelf · bring your national ID'
                  : `${DELIVERY_LABEL[order.delivery_option] || order.delivery_option} · ${order.collect_shelve
                      ? `${order.collect_shelve.name}, ${order.collect_shelve.ward}`
                      : [order.estate, order.house].filter(Boolean).join(', ') || order.ward}`}
              />
              {order.collect_shelve && (
                <span className="text-[11px] text-muted">
                  Collection is free. Bring your ID and the shelve code above to {order.collect_shelve.name},
                  open Mon–Sat {order.collect_shelve.opening_time} – {order.collect_shelve.closing_time}.
                </span>
              )}
              {order.hold_until && !delivery && <KeyValue label="Claim before" value={fmtDate(order.hold_until)} />}
              {order.delivery?.window_start && <KeyValue label="Delivery window" value={`${order.delivery.window_start} – ${order.delivery.window_end}`} />}
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              {delivery && <LinkButton to="/orders/$id/track" params={{ id: String(order.id) }} full>Track delivery</LinkButton>}
              <LinkButton to="/orders" variant={delivery ? 'outline' : 'primary'} full>View my orders</LinkButton>
              <LinkButton to={'/items' as any} variant="outline" full>Continue shopping</LinkButton>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4 md:p-5">
            <h3 className="text-[15px]">In this order</h3>
            {order.items.map((it) => <MiniItem key={it.id} image={it.image} title={it.title} sub={`${it.variant_label ? it.variant_label + ' · ' : ''}×${it.quantity}`} price={it.amount * it.quantity} size={40} />)}
            <Divider />
            <KeyValue label="Item subtotal" value={ksh(order.subtotal)} />
            {order.shelve_fee > 0 && <KeyValue label="Barter inspection fee" value={ksh(order.shelve_fee)} />}
            <KeyValue label="Delivery" value={order.delivery_fee ? ksh(order.delivery_fee) : 'Free'} />
            {order.protect_fee > 0 && <KeyValue label="UKO Protect" value={ksh(order.protect_fee)} />}
            {order.discount > 0 && <KeyValue label={`Promo · ${order.promo_code}`} value={<span className="text-success">− {ksh(order.discount)}</span>} />}
            <KeyValue label="Total" value={ksh(order.total)} strong />
          </div>
        </div>
      </div>
    </>
  )
}
