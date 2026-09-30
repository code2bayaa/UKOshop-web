import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Loader2, ShoppingCart, Smartphone, UserCheck } from 'lucide-react'
import { api, mpesaNumber, type Order } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useCart } from '#/lib/cart'
import { useToast } from '#/lib/toast'
import { newSocketKey, waitForMpesaCallback } from '#/lib/sockets'
import { ksh } from '#/lib/format'
import { Button, CheckoutStepper, Chip, Divider, EmptyState, Input, KeyValue, LinkButton, PageLoading, Radio, cx } from '#/components/ui'
import { DELIVERY_LABEL, StickyCta, clearCheckout, readCheckout, type CheckoutState } from '#/components/checkout'

type Search = { order?: number }
type Method = 'mpesa' | 'airtel' | 'card'
type PayResp = { status: string; ref?: string; merchant_request_id?: string; checkout_request_id?: string; socket_key?: string; message?: string; simulated?: boolean; expires_in?: number; order: Order }

export const Route = createFileRoute('/checkout/payment')({
  validateSearch: (s: Record<string, unknown>): Search => {
    const n = typeof s.order === 'number' ? s.order : typeof s.order === 'string' && s.order ? Number(s.order) : NaN
    return { order: Number.isFinite(n) ? n : undefined }
  },
  component: PaymentPage,
})

const METHODS: { key: Method; name: string; sub: string; Icon: typeof Smartphone }[] = [
  { key: 'mpesa', name: 'M-PESA', sub: 'Paybill 4001234 · STK push to your phone', Icon: Smartphone },
  // Phase 2 — re-enable once the Airtel Money and card gateways are installed:
  // { key: 'airtel', name: 'Airtel Money', sub: 'Push prompt to your Airtel line', Icon: Smartphone },
  // { key: 'card', name: 'Visa / Mastercard', sub: '3-D Secure verification required', Icon: CreditCard },
]

function PaymentPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { user, ready } = useAuth()
  const { cart, promo, refresh } = useCart()
  const toast = useToast()

  const [ck, setCk] = useState<CheckoutState>({})
  const [existing, setExisting] = useState<Order | null>(null)
  const [loadingOrder, setLoadingOrder] = useState(!!search.order)
  const [method, setMethod] = useState<Method>('mpesa')
  const [phone, setPhone] = useState('')
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvv: '' })
  const [stage, setStage] = useState<'idle' | 'placing' | 'pending' | 'paid'>('idle')
  const [seconds, setSeconds] = useState(120)
  const [orderId, setOrderId] = useState<number | null>(null)
  const [pendingMsg, setPendingMsg] = useState('')
  const finishing = useRef(false)
  const socketWait = useRef<{ cancel: () => void } | null>(null)

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: search.order ? `/checkout/payment?order=${search.order}` : '/checkout/payment' } })
  }, [ready, user, navigate, search.order])
  useEffect(() => {
    setCk(readCheckout())
  }, [])
  useEffect(() => {
    if (user) {
      setPhone((p) => p || mpesaNumber(user))
      setCard((c) => ({ ...c, name: c.name || user.name }))
    }
  }, [user])
  useEffect(() => {
    if (!user || !search.order) return
    setLoadingOrder(true)
    api.get<Order>(`/orders/${search.order}`)
      .then((o) => {
        setExisting(o)
        setOrderId(o.id)
        if (o.phone) setPhone(o.phone)
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingOrder(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search.order])

  const finish = (id: number) => {
    if (finishing.current) return
    finishing.current = true
    setStage('paid')
    clearCheckout()
    refresh().catch(() => {})
    toast.success('Payment received — your order is confirmed')
    navigate({ to: '/checkout/done', search: { order: id } })
  }

  // Poll payment status every 2s while the prompt is pending.
  useEffect(() => {
    if (stage !== 'pending' || !orderId) return
    const t = setInterval(async () => {
      try {
        const r = await api.post<{ status: string; order: Order }>(`/orders/${orderId}/payment-status`)
        if (r.status === 'paid') finish(orderId)
        else if (r.status === 'unpaid') {
          socketWait.current?.cancel()
          setStage('idle')
          toast.error('Payment was declined or cancelled. Try again.')
        }
      } catch {}
    }, 2000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, orderId])
  // Countdown for the prompt.
  useEffect(() => {
    if (stage !== 'pending') return
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(t)
          setStage('idle')
          toast.error('The payment prompt expired. Place the order again to retry.')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  if (!ready || !user || loadingOrder) return <><CheckoutStepper step={3} /><PageLoading /></>

  const lines = cart.items.filter((l) => !l.saved_for_later)
  const s = cart.summary
  if (!existing && lines.length === 0) {
    return (
      <>
        <CheckoutStepper step={3} />
        <div className="container-x py-10">
          <EmptyState icon={<ShoppingCart size={30} />} title="Nothing to pay for yet" sub="Your cart is empty. Add items from a shelf, or pay an existing order from My orders." action={<div className="flex gap-2"><LinkButton to={'/items' as any}>Browse items</LinkButton><LinkButton to="/orders" variant="outline">My orders</LinkButton></div>} />
        </div>
      </>
    )
  }
  if (!existing && !ck.delivery_option) {
    return (
      <>
        <CheckoutStepper step={3} />
        <div className="container-x py-10">
          <EmptyState icon={<ShoppingCart size={30} />} title="Choose a shelf and delivery first" sub="We need to know where to hold your items before payment." action={<LinkButton to="/checkout/shelve" search={{}}>Shelf & delivery</LinkButton>} />
        </div>
      </>
    )
  }

  if (existing && existing.payment_status === 'paid') {
    return (
      <>
        <CheckoutStepper step={3} />
        <div className="container-x py-10">
          <EmptyState icon={<UserCheck size={30} />} title={`Order ${existing.order_no} is already paid`} sub="Escrow holds the money until you claim the item." action={<LinkButton to="/checkout/done" search={{ order: existing.id }}>View confirmation</LinkButton>} />
        </div>
      </>
    )
  }

  const itemsLabel = existing ? `${existing.item_count} item${existing.item_count === 1 ? '' : 's'} · ${existing.shelve ? 1 : 0} shel${existing.shelve ? 'f' : 'ves'}` : `${s.count} item${s.count === 1 ? '' : 's'} · ${s.shelves} shel${s.shelves === 1 ? 'f' : 'ves'}`
  const collectFrom = existing ? existing.shelve?.name || '—' : ck.shelve_name || '—'
  const deliveryKey = existing ? existing.delivery_option : ck.delivery_option || 'pickup'
  const deliveryWard = existing ? existing.ward || existing.shelve?.ward : ck.ward || ck.shelve_ward
  const deliveryLabel = `${deliveryKey === 'rider' ? 'Rider' : DELIVERY_LABEL[deliveryKey] || deliveryKey}${deliveryWard ? ` · ${deliveryWard}` : ''}${deliveryKey === 'rider' ? ' · today' : ''}`
  const total = existing ? existing.total : s.total + (ck.delivery_fee || 0)
  const payingWith = method === 'card' ? `Card ${card.number.replace(/\s+/g, '').slice(-4) ? '•••• ' + card.number.replace(/\s+/g, '').slice(-4) : ''}` : `${method === 'mpesa' ? 'M-PESA' : 'Airtel Money'} ${phone}`
  const busy = stage === 'placing' || stage === 'pending' || stage === 'paid'

  const placeOrder = async () => {
    if (method !== 'card' && !phone.trim()) return toast.error('Enter the mobile money number to charge')
    if (method === 'card' && !(card.number && card.expiry && card.cvv)) return toast.error('Card number, expiry and CVV are required')
    setStage('placing')
    try {
      let id = existing?.id ?? orderId
      if (!id) {
        const o = await api.post<Order>('/orders', {
          shelve_id: ck.shelve_id ?? null,
          dest_shelve_id: ck.collect_shelve_id ?? null,
          delivery_option: ck.delivery_option || 'pickup',
          recipient_name: ck.recipient_name || user.name,
          phone: ck.phone || user.telephone,
          estate: ck.estate || '',
          house: ck.house || '',
          ward: ck.ward || '',
          county: ck.county || '',
          dest_lat: ck.dest_lat ?? null,
          dest_lng: ck.dest_lng ?? null,
          notes: ck.notes || '',
          promo_code: s.promo_code || promo || '',
          confirm_funds: true,
          confirm_account: true,
          sms_reminders: !!ck.sms,
        })
        id = o.id
        setOrderId(o.id)
        refresh().catch(() => {})
      }
      const socketKey = newSocketKey()
      const body = method === 'card' ? { method, card_number: card.number, card_name: card.name, expiry: card.expiry, cvv: card.cvv } : { method, phone, socket_key: socketKey }
      const r = await api.post<PayResp>(`/orders/${id}/pay`, body)
      if (r.status === 'paid') return finish(id)
      setPendingMsg(r.message || '')
      setSeconds(r.expires_in || 120)
      setStage('pending')
      // live Daraja push: the callback reaches us through the sockets room (MerchantRequestID$key); the API verifies it before marking the order paid
      const mr = r.merchant_request_id
      if (mr) {
        socketWait.current?.cancel()
        const w = waitForMpesaCallback(mr, r.socket_key || socketKey, { checkoutRequestId: r.checkout_request_id, timeoutMs: (r.expires_in || 120) * 1000 })
        socketWait.current = w
        w.promise.then(async (cb) => {
          try {
            const c = await api.post<{ status: string; error?: string | null }>('/payments/mpesa/confirm', { order_id: id, stk_callback: cb })
            if (c.status === 'paid' || c.status === 'released') finish(id)
            else if (c.status === 'unpaid') { setStage('idle'); toast.error(c.error || 'Payment was declined or cancelled. Try again.') }
          } catch { /* 409 = Safaricom not confirmed yet — the status poll keeps checking */ }
        }).catch(() => {})
      }
    } catch (e: any) {
      setStage('idle')
      toast.error(e.message)
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const pendingTitle = method === 'mpesa' ? 'Waiting for M-PESA PIN…' : method === 'airtel' ? 'Waiting for Airtel Money PIN…' : 'Verifying your card (3-D Secure)…'

  const pendingCard = stage === 'pending' && (
    <div className="flex flex-col gap-2 rounded-sm bg-warning-050 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-warning"><Loader2 size={14} className="spin" /> {pendingTitle}</div>
      <span className="text-[11px] text-ink-2">{pendingMsg || 'Check your phone for the prompt.'} Prompt expires in {mm}:{ss}.</span>
    </div>
  )

  return (
    <>
      <CheckoutStepper step={3} />
      <div className="container-x py-4 md:py-8">
        <div className="grid gap-5 md:grid-cols-[1fr_380px] md:gap-7">
          <section className="flex min-w-0 flex-col gap-4 md:gap-[18px]">
            <div className="hidden flex-col gap-1 md:flex">
              <h1 className="text-[26px] leading-tight">Payment</h1>
              <p className="m-0 text-[13px] text-ink-2">Your money is held in escrow until the item is claimed at the shelf or signed for on delivery.</p>
            </div>

            <div className="flex items-center gap-3 rounded-md bg-success-050 p-3 md:rounded-lg md:p-3.5">
              <UserCheck size={18} className="shrink-0 text-success" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-xs font-bold text-ink md:text-[13px]">Signed in as {user.name} · {user.telephone}</span>
                <span className="text-[10px] text-ink-2 md:text-[11px]">Orders, receipts and claim codes are sent to this account.</span>
              </div>
              <Link to="/signin" search={{ next: '/checkout/payment' }} className="hidden shrink-0 rounded-md border border-border-strong px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-surface md:inline-flex">Switch</Link>
            </div>

            <div className="flex flex-col gap-2.5 md:gap-3">
              <h3 className="text-[15px]">Choose a payment method</h3>
              {METHODS.map(({ key, name, sub, Icon }) => {
                const active = method === key
                return (
                  <div key={key} className={cx('flex flex-col gap-3 rounded-md border p-3 transition-colors md:rounded-lg md:p-4', active ? 'border-primary bg-primary-050' : 'border-border bg-bg')}>
                    <button type="button" disabled={busy} onClick={() => setMethod(key)} className="flex w-full items-center gap-3 text-left">
                      <Radio checked={active} />
                      <span className="hidden h-[30px] w-[46px] items-center justify-center rounded-[6px] border border-border bg-bg md:flex"><Icon size={15} className="text-ink-2" /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[13px] font-bold text-ink md:text-sm">{name}</span>
                        <span className="text-[10px] text-ink-2 md:text-[11px]">{key === 'mpesa' && phone ? `STK push to ${phone}` : sub}</span>
                      </span>
                    </button>
                    {active && key !== 'card' && (
                      <div className="flex flex-col gap-3 border-t border-primary/15 pt-3">
                        {/* Pre-filled with the number saved on the profile (mpesa_number, else the contact phone) —
                            the same one the API charges. Typing over it charges that line for this payment only. */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-end gap-3">
                            <Input label={key === 'mpesa' ? 'M-PESA number' : 'Airtel Money number'} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xx xxx xxx" className="flex-1" disabled={busy} />
                            <Button variant="outline" size="sm" className="mb-px !py-[11px]" disabled={busy || phone === mpesaNumber(user)} onClick={() => setPhone(mpesaNumber(user))}>Use saved</Button>
                          </div>
                          <span className="text-[11px] text-muted">
                            {phone === mpesaNumber(user)
                              ? <>Saved on your profile · <Link to="/profile" className="font-semibold text-primary hover:underline">change it</Link></>
                              : 'Charged for this payment only — your profile keeps the saved number.'}
                          </span>
                        </div>
                        <ol className="m-0 flex list-none flex-col gap-1.5 rounded-sm bg-bg p-3">
                          {['Tap Place order — a payment prompt is sent to your phone', `Enter your ${key === 'mpesa' ? 'M-PESA' : 'Airtel Money'} PIN on the prompt`, 'We hold the money until you claim the item'].map((t, i) => (
                            <li key={t} className="flex items-center gap-2 text-[11px] text-ink-2">
                              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary-050 text-[10px] font-bold text-primary-600">{i + 1}</span> {t}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )
              })}
              {method === 'card' && (
                <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3.5 md:rounded-lg md:p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold">Card details</span>
                    <Chip size="sm">3-D Secure</Chip>
                  </div>
                  <Input label="Card number" inputMode="numeric" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} disabled={busy} />
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_120px_100px]">
                    <Input label="Name on card" className="col-span-2 md:col-span-1" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} disabled={busy} />
                    <Input label="Expiry" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} disabled={busy} />
                    <Input label="CVV" inputMode="numeric" placeholder="•••" maxLength={4} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} disabled={busy} />
                  </div>
                </div>
              )}
            </div>
            <div className="md:hidden">{pendingCard}</div>
          </section>

          <aside className="flex flex-col gap-3.5 rounded-lg border border-border bg-bg p-4 md:p-5">
            <h3 className="text-[17px]">Review &amp; place order</h3>
            <div className="flex flex-col gap-2.5">
              <KeyValue label="Items" value={itemsLabel} />
              <KeyValue label="Collect from" value={collectFrom} />
              <KeyValue label="Delivery" value={deliveryLabel} />
              <KeyValue label="Paying with" value={payingWith} />
              {existing && <KeyValue label="Order" value={existing.order_no} />}
            </div>
            <Divider />
            <div className="flex items-center justify-between">
              <span className="font-head text-[15px] font-bold">Total to pay</span>
              <span className="font-head text-2xl font-extrabold tracking-tight">{ksh(total)}</span>
            </div>
            <Button variant="secondary" size="lg" full onClick={placeOrder} loading={busy} className="hidden md:inline-flex">{stage === 'pending' ? 'Waiting for payment…' : existing ? 'Pay now' : 'Place order'}</Button>
            <p className="m-0 text-[10px] leading-relaxed text-muted">By placing this order you accept the UKO shop buyer terms, the 24-hour shelf holding policy and the escrow release rules.</p>
            <div className="hidden md:block">{pendingCard}</div>
          </aside>
        </div>
      </div>
      <StickyCta label="Total" value={ksh(total)}>
        <Button variant="secondary" full onClick={placeOrder} loading={busy}>{stage === 'pending' ? 'Waiting…' : existing ? 'Pay now' : 'Place order'}</Button>
      </StickyCta>
    </>
  )
}
