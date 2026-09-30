import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CircleCheck, ImageIcon, Lock, ShoppingCart, TriangleAlert } from 'lucide-react'
import type { CartLine } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useCart } from '#/lib/cart'
import { useToast } from '#/lib/toast'
import { ksh, timeAgo } from '#/lib/format'
import { Button, Checkbox, CheckoutStepper, Chip, Divider, EmptyState, KeyValue, LinkButton, Notice, PageLoading, QtyStepper, VerifiedBadge, cx } from '#/components/ui'
import { StickyCta, readCheckout, writeCheckout } from '#/components/checkout'

export const Route = createFileRoute('/cart')({ component: CartPage })

function CartPage() {
  const navigate = useNavigate()
  const { cart, loading, update, remove, clear, applyPromo, recheck } = useCart()
  const { user } = useAuth()
  const toast = useToast()
  const [mounted, setMounted] = useState(false)
  const [funds, setFunds] = useState(false)
  const [account, setAccount] = useState(false)
  const [sms, setSms] = useState(false)
  const [promo, setPromo] = useState('')
  const [checkedAt, setCheckedAt] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const s = readCheckout()
    setFunds(!!s.funds)
    setAccount(!!s.account)
    setSms(!!s.sms)
    setCheckedAt(new Date().toISOString())
    setMounted(true)
  }, [])
  useEffect(() => {
    if (mounted) writeCheckout({ funds, account, sms })
  }, [funds, account, sms, mounted])

  const s = cart.summary
  const lines = cart.items.filter((l) => !l.saved_for_later)
  const saved = cart.items.filter((l) => l.saved_for_later)
  const canContinue = funds && account && lines.length > 0

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  const doRecheck = () => run(async () => { await recheck(); setCheckedAt(new Date().toISOString()) })
  const submitPromo = (e: FormEvent) => {
    e.preventDefault()
    if (!promo.trim()) return
    run(async () => {
      const c = await applyPromo(promo.trim())
      toast.success(`${c.summary.promo_code} applied — you save ${ksh(c.summary.discount)}`)
    })
  }
  const proceed = () => {
    writeCheckout({ funds, account, sms })
    if (!user) {
      navigate({ to: '/signin', search: { next: '/cart' } })
      return
    }
    navigate({ to: '/checkout/shelve', search: { funds: true, account: true, sms } })
  }

  if (!mounted || (loading && cart.items.length === 0)) {
    return (
      <>
        <CheckoutStepper step={1} />
        <PageLoading />
      </>
    )
  }

  const summaryCard = (
    <aside className="flex flex-col gap-3.5 rounded-lg border border-border bg-bg p-4 md:p-5">
      <h3 className="text-[17px]">Cart summary</h3>
      <form onSubmit={submitPromo} className="flex gap-2">
        <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Promo or boost code" className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 py-[11px] text-xs text-ink outline-none placeholder:text-muted focus:border-primary-300" />
        <Button type="submit" variant="outline" size="sm" loading={busy} disabled={!promo.trim()}>Apply</Button>
      </form>
      <Divider />
      <div className="flex flex-col gap-2.5 text-xs">
        <KeyValue label="Items in cart" value={`${s.count} item${s.count === 1 ? '' : 's'}`} />
        <KeyValue label="Item subtotal" value={ksh(s.subtotal)} />
        <KeyValue label="Delivery" value={<span className="font-normal text-muted">Calculated at next step</span>} />
        {s.protect_fee > 0 && <KeyValue label={<span title="1% of each item's price (KSh 20 minimum, KSh 500 maximum a unit). Refunds you if the item is lost, stolen or damaged while UKO holds it.">UKO Protect</span>} value={ksh(s.protect_fee)} />}
        {s.discount > 0 && <KeyValue label={`Promo · ${s.promo_code}`} value={<span className="text-success">− {ksh(s.discount)}</span>} />}
      </div>
      <Divider />
      <div className="flex items-center justify-between">
        <span className="font-head text-[15px] font-bold">Total due</span>
        <span className="font-head text-[22px] font-extrabold tracking-tight">{ksh(s.total)}</span>
      </div>
      <div className="flex flex-col gap-2.5 rounded-sm bg-surface p-3">
        <Checkbox checked={funds} onChange={setFunds} label={<span className="text-[11px] leading-relaxed">I confirm I have the funds ready for this order</span>} />
        <Checkbox checked={account} onChange={setAccount} label={<span className="text-[11px] leading-relaxed">I confirm my account {user?.telephone ? <b className="font-semibold text-ink">{user.telephone}</b> : 'details'} {user?.telephone ? 'is' : 'are'} correct</span>} />
        <Checkbox checked={sms} onChange={setSms} label={<span className="text-[11px] leading-relaxed">Send me shelf pickup reminders by SMS</span>} />
      </div>
      <Button full size="lg" disabled={!canContinue} onClick={proceed} className="hidden md:inline-flex">{user ? 'Continue to shelf & delivery' : 'Sign in to continue'}</Button>
      <div className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
        <Lock size={13} className="mt-0.5 shrink-0 text-success" />
        <span>Money is held by UKO until you claim the item at the shelf or sign for delivery. Sellers receive payment minus the 20% UKO commission.</span>
      </div>
    </aside>
  )

  return (
    <>
      <CheckoutStepper step={1} />
      <div className="container-x py-5 md:py-8">
        <div className="grid gap-5 md:grid-cols-[1fr_380px] md:gap-7">
          <section className="flex min-w-0 flex-col gap-3.5 md:gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h1 className="hidden text-[26px] leading-tight md:block">Your cart</h1>
                <h1 className="text-lg leading-tight md:hidden">{s.count} item{s.count === 1 ? '' : 's'} · {s.shelves} shel{s.shelves === 1 ? 'f' : 'ves'}</h1>
                <p className="m-0 text-[11px] text-ink-2 md:text-[13px]">
                  <span className="hidden md:inline">{s.count} item{s.count === 1 ? '' : 's'} from {s.shelves} shel{s.shelves === 1 ? 'f' : 'ves'} · </span>
                  <span className="md:lowercase">Held for you for {s.hold_hours} hours</span>
                </p>
              </div>
              {cart.items.length > 0 && (
                <button type="button" disabled={busy} onClick={() => run(() => clear())} className="text-[11px] font-semibold text-danger hover:underline md:text-xs">
                  Clear <span className="hidden md:inline">cart</span>
                </button>
              )}
            </div>

            {lines.length > 0 && (
              <Notice
                tone={cart.notices.length ? 'warning' : 'info'}
                icon={cart.notices.length ? <TriangleAlert size={16} /> : <CircleCheck size={16} />}
                title={<span className="text-ink">Stock re-checked {checkedAt ? timeAgo(checkedAt) : 'just now'}</span>}
                action={<Button variant="outline" size="sm" onClick={doRecheck} loading={busy}>Re-check</Button>}
              >
                {cart.notices.length ? (
                  <ul className="m-0 list-disc pl-4 text-[11px] leading-relaxed">
                    {cart.notices.map((n, i) => <li key={i}>{n}</li>)}
                    <li>Quantities are checked again before payment.</li>
                  </ul>
                ) : (
                  <span className="text-[11px] leading-relaxed">All quantities match shelf stock. Quantities are checked again before payment.</span>
                )}
              </Notice>
            )}

            {lines.length === 0 && saved.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart size={30} />}
                title="Your cart is empty"
                sub="Browse shelves near you and add verified items to start checkout."
                action={<LinkButton to={'/items' as any}>Browse items</LinkButton>}
              />
            ) : (
              <>
                {lines.map((l) => (
                  <Line key={l.id} line={l} busy={busy} onQty={(q) => run(() => update(l.id, q))} onSave={() => run(() => update(l.id, l.quantity, true))} onRemove={() => run(() => remove(l.id))} />
                ))}
                {lines.length === 0 && (
                  <EmptyState icon={<ShoppingCart size={30} />} title="Nothing in your cart right now" sub="Move a saved item back to the cart or browse shelves near you." action={<LinkButton to={'/items' as any}>Browse items</LinkButton>} />
                )}
                {saved.length > 0 && (
                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base">Saved for later</h2>
                      <Chip size="sm">{saved.length}</Chip>
                    </div>
                    {saved.map((l) => (
                      <Line key={l.id} line={l} busy={busy} saved onQty={(q) => run(() => update(l.id, q))} onSave={() => run(() => update(l.id, l.quantity, false))} onRemove={() => run(() => remove(l.id))} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
          {summaryCard}
        </div>
      </div>
      {lines.length > 0 && (
        <StickyCta label="Total" value={ksh(s.total)}>
          <Button full disabled={!canContinue} onClick={proceed}>{user ? 'Continue' : 'Sign in to continue'}</Button>
        </StickyCta>
      )}
    </>
  )
}

function Line({ line, busy, saved, onQty, onSave, onRemove }: { line: CartLine; busy: boolean; saved?: boolean; onQty: (q: number) => void; onSave: () => void; onRemove: () => void }) {
  const low = line.low_stock
  const stock = low ? `Only ${line.available} left` : `${line.available} in stock`
  const total = line.amount * line.quantity
  const oldTotal = line.old_amount ? line.old_amount * line.quantity : null
  return (
    <div className={cx('flex gap-3 rounded-md border border-border bg-bg p-3 md:gap-3.5 md:rounded-lg md:p-3.5', saved && 'opacity-90')}>
      <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 md:h-[92px] md:w-[92px]">
        {line.item.image ? <img src={line.item.image} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={22} className="text-border-strong" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:gap-[7px]">
        <p className="m-0 line-clamp-2 text-xs font-bold leading-[1.35] text-ink md:text-sm md:font-semibold md:leading-[1.4]">{line.item.title}</p>
        <p className="m-0 text-[10px] text-ink-2 md:text-xs">{[line.variant_label, stock].filter(Boolean).join(' · ')}</p>
        <div className="flex flex-wrap items-center gap-1.5 md:gap-[7px]">
          {line.item.is_verified && <VerifiedBadge />}
          {line.item.shelve_name && <Chip size="sm">{line.item.shelve_name}</Chip>}
          {saved && <Chip size="sm" tone="primary">Saved</Chip>}
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <span className="font-head text-sm font-extrabold text-ink">{ksh(total)}</span>
          {oldTotal ? <span className="text-[10px] text-muted line-through">{ksh(oldTotal)}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 pt-0.5 md:gap-3.5">
          <QtyStepper value={line.quantity} onChange={onQty} min={1} max={Math.max(1, line.available)} size="sm" />
          <Chip size="sm" tone={low ? 'warning' : 'success'}>
            {low ? <TriangleAlert size={11} /> : <CircleCheck size={11} />} {low ? `Max ${line.available} in stock` : `${line.available} in stock`}
          </Chip>
          <button type="button" disabled={busy} onClick={onSave} className="text-[11px] font-semibold text-primary-600 hover:underline md:text-xs">{saved ? 'Move to cart' : 'Save for later'}</button>
          <button type="button" disabled={busy} onClick={onRemove} className="text-[11px] font-semibold text-danger hover:underline md:text-xs">Remove</button>
        </div>
      </div>
      <div className="hidden w-[110px] shrink-0 flex-col items-end gap-0.5 md:flex">
        <span className="font-head text-base font-extrabold text-ink">{ksh(total)}</span>
        {oldTotal ? <span className="text-xs text-muted line-through">{ksh(oldTotal)}</span> : null}
        {line.quantity > 1 && <span className="text-[11px] text-muted">{ksh(line.amount)} each</span>}
      </div>
    </div>
  )
}
