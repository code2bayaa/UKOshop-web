/** 03 · Item Detail (+ M3 mobile) — /items/$id */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftRight, Banknote, Facebook, HandHelping, ImageIcon, Link2, Lock, Mail, MapPin, Megaphone, MessageCircle, Package, Phone, Play, ShieldCheck, Star, Store, TriangleAlert, Truck, Twitter, Wrench, type LucideIcon } from 'lucide-react'
import { api, publicGet, type Bid, type ItemFull, type Review, type Shelve, type Variant } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useCart } from '#/lib/cart'
import { useToast } from '#/lib/toast'
import { discountPct, ksh, priceRange, timeAgo } from '#/lib/format'
import { ProductCard, ProductSlot, ScrollRow } from '#/components/cards'
import { MediaUploader, Thumb } from '#/components/media'
import { Avatar, Breadcrumbs, Button, Checkbox, Chip, Divider, Input, Notice, QtyStepper, Radio, Stars, Tabs, Textarea, VerifiedBadge, cx } from '#/components/ui'

export const Route = createFileRoute('/items/$id')({
  loader: ({ params }) => publicGet<ItemFull>('/items/' + params.id),
  component: ItemPage,
})

type OptKey = 'type' | 'color' | 'size'
type Sel = Partial<Record<OptKey, string>>
type Media = { kind: 'image' | 'video'; src: string }
type TabKey = 'details' | 'specs' | 'feedback' | 'delivery'

const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)))
const matches = (v: Variant, sel: Sel, skip?: OptKey) => (['type', 'color', 'size'] as OptKey[]).every((k) => k === skip || !sel[k] || v[k] === sel[k])

function summarize(reviews: Review[]): ItemFull['feedback'] {
  const count = reviews.length
  const average = count ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : 0
  return {
    count,
    average,
    bars: [5, 4, 3, 2, 1].map((n) => ({ stars: n, pct: count ? Math.round((reviews.filter((r) => r.rating === n).length * 100) / count) : 0 })),
    media: reviews.flatMap((r) => r.media).slice(0, 8),
    reviews,
  }
}

function ItemPage() {
  const item = Route.useLoaderData()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { add } = useCart()
  const toast = useToast()

  // record the view once per item
  const viewed = useRef<number | null>(null)
  useEffect(() => {
    if (viewed.current === item.id) return
    viewed.current = item.id
    api.post(`/items/${item.id}/view`).catch(() => {})
  }, [item.id])

  // ---------------------------------------------------------------- gallery
  const media: Media[] = useMemo(() => [...item.images.map((src) => ({ kind: 'image' as const, src })), ...item.videos.map((src) => ({ kind: 'video' as const, src }))], [item.images, item.videos])
  const [mi, setMi] = useState(0)
  useEffect(() => setMi(0), [item.id])
  const current = media[mi]

  const share = (kind: 'copy' | 'whatsapp' | 'facebook' | 'x') => {
    const url = window.location.href
    const text = `${item.title} · ${priceRange(item.min_amount, item.max_amount)} on UKO shop`
    if (kind === 'copy') {
      navigator.clipboard?.writeText(url).then(() => toast.success('Link copied')).catch(() => toast.error('Could not copy the link'))
      return
    }
    const href = kind === 'whatsapp' ? `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` : kind === 'facebook' ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` : `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
    window.open(href, '_blank', 'noopener')
  }

  // ---------------------------------------------------------------- variants & selection
  const variants = item.variants
  const types = useMemo(() => uniq(variants.map((v) => v.type)), [variants])
  const colors = useMemo(() => uniq(variants.map((v) => v.color)), [variants])
  const sizes = useMemo(() => uniq(variants.map((v) => v.size)), [variants])
  const groups: { key: OptKey; label: string; values: string[] }[] = []
  if (types.length) groups.push({ key: 'type', label: 'Type', values: types })
  if (colors.length) groups.push({ key: 'color', label: types.length ? 'Strap colour' : 'Colour', values: colors })
  if (sizes.length) groups.push({ key: 'size', label: 'Size', values: sizes })

  const [sel, setSel] = useState<Sel>({})
  const [qty, setQty] = useState(1)
  useEffect(() => { setSel({}); setQty(1) }, [item.id])

  const available = (k: OptKey, value: string) => variants.some((v) => v[k] === value && matches(v, sel, k))
  const choose = (k: OptKey, value: string) => setSel((s) => (s[k] === value ? { ...s, [k]: undefined } : { ...s, [k]: value }))
  const complete = groups.every((g) => !!sel[g.key])
  const variant = complete && variants.length ? variants.find((v) => matches(v, sel)) : undefined
  const typeMin = sel.type ? Math.min(...variants.filter((v) => v.type === sel.type).map((v) => v.amount)) : null
  const typeMax = sel.type ? Math.max(...variants.filter((v) => v.type === sel.type).map((v) => v.amount)) : null
  const unitPrice = variant ? variant.amount : item.min_amount
  const stock = variant ? variant.stock : item.stock
  const pct = discountPct(item.old_amount, unitPrice)
  const selLabel = groups.map((g) => sel[g.key]).filter(Boolean).join(' · ')
  const ready = variants.length === 0 || !!variant
  useEffect(() => { if (qty > Math.max(1, stock)) setQty(Math.max(1, stock)) }, [stock, qty])

  const [busy, setBusy] = useState<'cart' | 'buy' | null>(null)
  const addToCart = async (buy: boolean) => {
    if (!ready) return toast.error(`Choose ${groups.map((g) => g.label.toLowerCase()).join(', ')} first`)
    if (stock < 1) return toast.error('This combination is out of stock')
    setBusy(buy ? 'buy' : 'cart')
    try {
      await add(item.id, variant ? variant.id : null, qty)
      if (buy) navigate({ to: '/cart' as any })
      else toast.success(`Added ${qty} × ${item.title} to your cart`)
    } catch (e: any) {
      toast.error(e.message || 'Could not add to cart')
    } finally {
      setBusy(null)
    }
  }

  // ---------------------------------------------------------------- direct from seller
  const [contacts, setContacts] = useState(false)
  const [contactsBusy, setContactsBusy] = useState(false)
  const showContacts = async () => {
    if (!user) return navigate({ to: '/signin' as any, search: { next: `/items/${item.id}` } as any })
    setContactsBusy(true)
    try {
      await api.post('/orders/direct', { item_id: item.id, variant_id: variant ? variant.id : null, quantity: qty })
    } catch {
      /* contacts still shown; recording the enquiry is best-effort */
    } finally {
      setContactsBusy(false)
      setContacts(true)
    }
  }

  // ---------------------------------------------------------------- feedback
  const [tab, setTab] = useState<TabKey>('details')
  const [feedback, setFeedback] = useState(item.feedback)
  useEffect(() => { setFeedback(item.feedback); setTab('details') }, [item.id, item.feedback])
  const refreshFeedback = async () => {
    const rows = await api.get<Review[]>(`/items/${item.id}/feedback`)
    setFeedback(summarize(rows))
  }

  const shelfName = item.shelve?.name || (item.ward ? `${item.ward} shelf` : 'a UKO shelf')
  const hours = item.shelve ? `Mon–Sat ${item.shelve.opening_time}–${item.shelve.closing_time}` : 'Mon–Sat 08:00–19:00'
  const deliveryFee = item.shelve?.delivery_fee ?? 180

  const primaryActions = (
    <>
      <Button full loading={busy === 'cart'} disabled={!item.on_shelve || busy !== null} onClick={() => addToCart(false)}>Add to cart</Button>
      <Button full variant="secondary" loading={busy === 'buy'} disabled={!item.on_shelve || busy !== null} onClick={() => addToCart(true)}>Buy now</Button>
    </>
  )

  return (
    <div className="flex flex-col pb-6">
      {/* Breadcrumb strip */}
      <div className="hidden w-full border-b border-border bg-surface md:block">
        <div className="container-x flex h-[46px] items-center"><Breadcrumbs crumbs={item.crumbs} /></div>
      </div>

      <div className="container-x grid gap-6 pt-4 md:gap-8 md:pt-7 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Gallery */}
        <section className="flex flex-col gap-3.5">
          <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 md:aspect-[4/3]">
            {current?.kind === 'video' ? (
              <video key={current.src} src={current.src} controls className="h-full w-full bg-ink object-contain" />
            ) : current ? (
              <img src={current.src} alt={item.title} className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={48} className="text-border-strong" />
            )}
            {item.is_verified && <VerifiedBadge label="Verified at shelf" className="absolute left-3 top-3 shadow" />}
            {media.length > 0 && <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-semibold text-white">{mi + 1} / {media.length}</span>}
          </div>
          {media.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {media.map((m, i) => (
                <button key={m.src + i} type="button" onClick={() => setMi(i)} aria-label={`${m.kind} ${i + 1}`} className={cx('shrink-0 rounded-md border-2 transition-colors', i === mi ? 'border-primary' : 'border-transparent hover:border-border-strong')}>
                  {m.kind === 'video' ? (
                    <span className="relative flex h-[64px] w-[64px] items-center justify-center overflow-hidden rounded-[4px] bg-ink text-white"><video src={m.src} muted className="h-full w-full object-cover opacity-70" /><Play size={20} className="absolute" /></span>
                  ) : (
                    <Thumb src={m.src} size={64} className="rounded-[4px]" />
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-ink-2">
            <span className="mr-1 font-semibold">Share link</span>
            {[
              { k: 'copy' as const, Icon: Link2, label: 'Copy link' },
              { k: 'whatsapp' as const, Icon: MessageCircle, label: 'WhatsApp' },
              { k: 'facebook' as const, Icon: Facebook, label: 'Facebook' },
              { k: 'x' as const, Icon: Twitter, label: 'X' },
            ].map(({ k, Icon, label }) => (
              <button key={k} type="button" aria-label={label} title={label} onClick={() => share(k)} className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-2 hover:bg-surface hover:text-primary"><Icon size={14} /></button>
            ))}
          </div>
        </section>

        {/* Buy panel */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] leading-[1.25] md:text-[24px]">{item.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
              {item.is_verified ? <VerifiedBadge /> : <Chip size="sm" tone="warning">{item.on_shelve ? 'On shelf · pending verification' : 'Seller direct'}</Chip>}
              {/* ad-site-only ads are not listed in UKOshop — this page is only reachable from the UKOapp ad site link */}
              {item.adsite_only && <Chip size="sm" tone="primary"><Megaphone size={11} /> UKOapp ad site ad</Chip>}
              <span className="flex items-center gap-1.5"><Stars value={item.rating} /> {item.rating ? item.rating.toFixed(1) : '—'} · {item.rating_count} reviews</span>
              <span className="text-success">{item.sold_count} sold</span>
            </div>
          </div>

          {/* Price box */}
          <div className="flex flex-col gap-2.5 rounded-md bg-surface p-4">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-head text-[26px] font-extrabold leading-none text-ink">{variant ? ksh(variant.amount) : typeMin !== null && typeMax !== null ? priceRange(typeMin, typeMax) : priceRange(item.min_amount, item.max_amount)}</span>
              {item.old_amount ? <span className="text-sm text-muted line-through">{ksh(item.old_amount)}</span> : null}
              {pct > 0 && <Chip size="sm" tone="secondary">-{pct}%</Chip>}
              {item.barter_enabled && <Chip size="sm" tone="primary"><ArrowLeftRight size={11} /> Barter available</Chip>}
            </div>
            <p className="m-0 text-xs text-ink-2">{variant ? 'Amount fixed for your selection' : 'Range shown until you choose a type'} · {item.stock} units in stock at {shelfName}</p>
            {variant && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-primary-300 bg-primary-050 px-3 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-primary-600">Your selection · {selLabel}</span>
                  <span className="text-[11px] text-ink-2">Amount is fixed once {groups.map((g) => g.label.toLowerCase()).join(', ')} {groups.length > 1 ? 'are' : 'is'} chosen</span>
                </div>
                <span className="font-head text-lg font-extrabold text-primary">{ksh(variant.amount)}</span>
              </div>
            )}
          </div>

          {/* Options */}
          {groups.map((g, gi) => (
            <div key={g.key} className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-bold">{gi + 1} · {g.label}</span>
                {g.key === 'type' && <span className="text-[11px] text-muted">the amount is set by the type you pick</span>}
              </div>
              {g.key === 'type' ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {g.values.map((t) => {
                    const ok = available('type', t)
                    const min = Math.min(...variants.filter((v) => v.type === t).map((v) => v.amount))
                    return (
                      <button key={t} type="button" disabled={!ok} onClick={() => choose('type', t)} className={cx('flex flex-col items-center gap-1 rounded-md border px-3 py-2.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40', sel.type === t ? 'border-primary bg-primary-050' : 'border-border-strong hover:bg-surface')}>
                        <span className="text-[13px] font-semibold text-ink">{t}</span>
                        <span className="text-xs text-ink-2">{ksh(min)}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {g.values.map((v) => {
                    const ok = available(g.key, v)
                    return (
                      <button key={v} type="button" disabled={!ok} onClick={() => choose(g.key, v)} className={cx('rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40', sel[g.key] === v ? 'border-primary bg-primary text-white' : 'border-border-strong text-ink hover:bg-surface')}>{v}</button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Quantity */}
          <div className="flex items-center gap-4">
            <span className="text-[13px] font-bold">Quantity</span>
            <QtyStepper value={qty} onChange={setQty} min={1} max={Math.max(1, stock)} />
            <span className={cx('text-xs', stock > 0 ? 'text-ink-2' : 'text-danger')}>{stock > 0 ? `${stock} available` : 'Out of stock'}</span>
          </div>

          {/* Primary actions (desktop) */}
          <div className="hidden flex-col gap-2 md:flex">
            <div className="flex gap-2.5">{primaryActions}</div>
            {!item.on_shelve && <p className="m-0 text-xs text-warning">Not on a shelf — order from the seller directly</p>}
            {item.on_shelve && !ready && <p className="m-0 text-xs text-muted">Choose {groups.map((g) => g.label.toLowerCase()).join(', ')} to add to cart</p>}
          </div>
          {!item.on_shelve && <p className="m-0 text-xs text-warning md:hidden">Not on a shelf — order from the seller directly</p>}

          {/* Direct from seller */}
          <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-050/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-bold">Order from the seller directly</span>
              <Chip size="sm" tone="warning">Off-platform</Chip>
            </div>
            <Notice tone="warning" icon={<TriangleAlert size={15} />}>
              UKO shop credibility notice: paying the seller directly is not covered by shelf verification, escrow or delivery guarantees. Disputes cannot be refunded by UKO shop.
            </Notice>
            {contacts && (
              <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bg p-3 text-[13px]">
                {item.seller.telephone && <a href={`tel:${item.seller.telephone}`} className="flex items-center gap-2 hover:text-primary"><Phone size={14} className="text-muted" /> {item.seller.telephone}</a>}
                {item.seller.whatsapp && <a href={`https://wa.me/${item.seller.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary"><MessageCircle size={14} className="text-muted" /> WhatsApp {item.seller.whatsapp}</a>}
                {item.seller.email && <a href={`mailto:${item.seller.email}`} className="flex items-center gap-2 hover:text-primary"><Mail size={14} className="text-muted" /> {item.seller.email}</a>}
                <span className="text-[11px] text-muted">Recorded as a direct enquiry under My orders — no escrow applies.</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" full loading={contactsBusy} onClick={showContacts}>{contacts ? 'Contacts shown' : user ? 'Show contacts' : 'Sign in to see contacts'}</Button>
              <Link to={'/chat/$userId' as any} params={{ userId: String(item.seller.id) } as any} search={{ item: item.id } as any} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border-strong px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-surface"><MessageCircle size={14} /> Chat with seller</Link>
            </div>
          </div>

          {/* Barter trade */}
          {item.barter_enabled && <BarterPanel key={item.id} item={item} signedIn={!!user} isOwner={!!user && user.id === item.seller.id} />}

          {/* Seller info */}
          <div className="flex items-center gap-3 rounded-lg border border-border p-4">
            <Avatar name={item.seller.name} src={item.seller.avatar || undefined} size={44} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[14px] font-bold">{item.seller.name}</span>
                <Chip size="sm" tone="primary">{item.seller.tier}</Chip>
              </div>
              <span className="text-xs text-ink-2">{item.seller.positive_rate}% positive · {item.seller.items_sold} items sold · replies in ~2h · joined {item.seller.joined_year}</span>
            </div>
            <Link to="/items" search={{ seller: item.seller.id } as any} className="shrink-0 rounded-md border border-border-strong px-3 py-2 text-xs font-semibold hover:bg-surface">Visit store</Link>
          </div>

          {/* Fulfilment */}
          <div className="flex flex-col gap-3">
            {[
              { Icon: Store, t: `Pick up at ${shelfName}`, s: `Free · ready in 2 hours · ${hours}` },
              { Icon: Truck, t: 'Delivery to your ward', s: `${ksh(deliveryFee)} · same day within Nairobi, 48h upcountry` },
              { Icon: ShieldCheck, t: 'Escrow protection', s: 'Seller is paid after you claim the item with your ID' },
            ].map(({ Icon, t, s }) => (
              <div key={t} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Icon size={16} /></span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold">{t}</span>
                  <span className="text-xs text-ink-2">{s}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Details section */}
      <section className="container-x mt-8 flex flex-col gap-5 md:mt-12">
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'details', label: <><span className="md:hidden">Details</span><span className="hidden md:inline">Product details</span></> },
            { key: 'specs', label: <><span className="md:hidden">Specs</span><span className="hidden md:inline">Specification &amp; features</span></> },
            { key: 'feedback', label: <><span className="md:hidden">Feedback</span><span className="hidden md:inline">Customer feedback</span></>, count: feedback.count },
            { key: 'delivery', label: <><span className="md:hidden">Delivery</span><span className="hidden md:inline">Delivery &amp; returns</span></> },
          ]}
        />
        {tab === 'details' && (
          <div className="flex max-w-3xl flex-col gap-3">
            <h3 className="text-lg">Product details</h3>
            {item.description ? <div className="prose-uko" dangerouslySetInnerHTML={{ __html: item.description }} /> : <p className="m-0 text-sm text-ink-2">The seller has not added a description yet.</p>}
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-2">
              {item.brand && <Chip size="sm">Brand · {item.brand}</Chip>}
              {item.condition && <Chip size="sm">{item.condition}</Chip>}
              {item.gender && <Chip size="sm">{item.gender}</Chip>}
              {item.sku && <Chip size="sm">SKU {item.sku}</Chip>}
              {item.weight_kg ? <Chip size="sm">{item.weight_kg} kg</Chip> : null}
            </div>
          </div>
        )}
        {tab === 'specs' && (
          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h3 className="text-lg">Features</h3>
              {item.features ? <div className="prose-uko" dangerouslySetInnerHTML={{ __html: item.features }} /> : <p className="m-0 text-sm text-ink-2">No features listed.</p>}
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-lg">Specification</h3>
              {item.specification ? <div className="prose-uko" dangerouslySetInnerHTML={{ __html: item.specification }} /> : <p className="m-0 text-sm text-ink-2">No specification listed.</p>}
            </div>
          </div>
        )}
        {tab === 'feedback' && <FeedbackTab item={item} feedback={feedback} onPosted={refreshFeedback} signedIn={!!user} />}
        {tab === 'delivery' && (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { Icon: Store, t: '24-hour shelf holding', s: 'Once you pay, the shelf holds your item for 24 hours. Claim it at the counter with your ID or the 4-digit code in your order.' },
              { Icon: Lock, t: 'Escrow release rules', s: 'Your money stays in escrow until you claim the item at the shelf or confirm delivery with the rider code. Only then is the seller paid (UKO keeps 20%).' },
              { Icon: TriangleAlert, t: 'Report within 24 hours', s: 'Not as described or damaged? Report it from My orders within 24 hours of claiming and the shelf agent will start a return; escrow is refunded in full.' },
            ].map(({ Icon, t, s }) => (
              <div key={t} className="flex flex-col gap-2 rounded-lg border border-border p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-050 text-primary"><Icon size={18} /></span>
                <span className="text-[14px] font-bold">{t}</span>
                <p className="m-0 text-[13px] leading-relaxed text-ink-2">{s}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* More from seller */}
      {item.more_from_seller.length > 0 && (
        <div className="container-x mt-10 md:mt-14">
          <ScrollRow title={`More items from ${item.seller.name}`} more={{ to: '/items', search: { seller: item.seller.id }, label: 'See all' }}>
            {item.more_from_seller.map((i) => <ProductSlot key={i.id}><ProductCard item={i} /></ProductSlot>)}
          </ScrollRow>
        </div>
      )}

      {/* Sticky action bar (mobile) */}
      <div className="h-[80px] md:hidden" />
      <div className="fixed inset-x-0 bottom-[66px] z-40 flex items-center gap-2.5 border-t border-border bg-bg px-3.5 py-3 shadow-[0_-6px_20px_-12px_rgba(27,42,107,0.25)] md:hidden">
        <QtyStepper value={qty} onChange={setQty} min={1} max={Math.max(1, stock)} />
        {primaryActions}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ barter trade
type OfferType = Bid['offer_type']
type BarterShelve = Shelve & { distance_km: number; suggested: boolean }
const NEEDS_CASH = new Set<OfferType>(['item_cash', 'cash_service'])
const NEEDS_ITEM = new Set<OfferType>(['item', 'item_cash', 'item_service'])
const NEEDS_SERVICE = new Set<OfferType>(['item_service', 'service', 'cash_service'])
const OFFER_ICON: Record<OfferType, LucideIcon> = { item: Package, item_cash: Banknote, item_service: Wrench, service: HandHelping, cash_service: Banknote }
const OFFER_HINT: Record<OfferType, string> = {
  item: 'Swap your item for this one',
  item_cash: 'Your item plus cash to top up',
  item_service: 'Your item plus a service you offer',
  service: 'A service you can offer the seller',
  cash_service: 'Cash plus a service you offer',
}

function BarterPanel({ item, signedIn, isOwner }: { item: ItemFull; signedIn: boolean; isOwner: boolean }) {
  const toast = useToast()
  const types = item.barter_types as { key: OfferType; label: string }[] // server only emits keys from BARTER_TYPES
  const [showPolicy, setShowPolicy] = useState(false)
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState<Bid | null>(null)
  const [busy, setBusy] = useState(false)

  // offer
  const [offerType, setOfferType] = useState<OfferType>(types[0]?.key || 'item')
  const [offeredItem, setOfferedItem] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [service, setService] = useState('')
  const [cash, setCash] = useState('')
  const [message, setMessage] = useState('')
  const [accept, setAccept] = useState(false)

  // where the trade happens
  const [mode, setMode] = useState<Bid['trade_mode']>(item.barter_via_shelve ? 'shelve' : 'direct')
  const [shelves, setShelves] = useState<BarterShelve[] | null>(null)
  const [shelvesErr, setShelvesErr] = useState('')
  const [shelveId, setShelveId] = useState<number | null>(null)
  useEffect(() => {
    if (!open || mode !== 'shelve' || shelves !== null) return
    let alive = true
    api.get<BarterShelve[]>(`/items/${item.id}/barter-shelves`)
      .then((rows) => {
        if (!alive) return
        setShelves(rows)
        const first = rows.find((s) => s.suggested) || rows[0]
        setShelveId((cur) => cur ?? (first ? first.id : null))
      })
      .catch((e: any) => { if (alive) { setShelves([]); setShelvesErr(e.message || 'Could not load shelves') } })
    return () => { alive = false }
  }, [open, mode, shelves, item.id])

  const needsCash = NEEDS_CASH.has(offerType)
  const needsItem = NEEDS_ITEM.has(offerType)
  const needsService = NEEDS_SERVICE.has(offerType)
  const cashAmount = needsCash ? Math.max(0, Number(cash) || 0) : 0 // amount becomes 0 when no cash was selected
  const shelve = mode === 'shelve' ? shelves?.find((s) => s.id === shelveId) || null : null
  const shelveFee = shelve ? shelve.barter_fee : 0
  const total = cashAmount + shelveFee
  const give = [needsItem && (offeredItem.trim() || 'your item'), needsService && (service.trim() ? 'a service' : 'your service')].filter(Boolean).join(' + ')

  const reset = () => { setOfferedItem(''); setImages([]); setService(''); setCash(''); setMessage(''); setAccept(false); setSent(null) }

  const submit = async () => {
    if (needsItem && !offeredItem.trim()) return toast.error('Describe the item you are offering')
    if (needsService && !service.trim()) return toast.error('Describe the service you are offering')
    if (needsCash && cashAmount <= 0) return toast.error('Enter the cash amount you are adding')
    if (mode === 'shelve' && !shelveId) return toast.error('Choose a shelve to trade at')
    if (!accept) return toast.error('Accept the barter trade policy to continue')
    setBusy(true)
    try {
      const bid = await api.post<Bid>(`/items/${item.id}/bids`, {
        offer_type: offerType,
        offered_item: needsItem ? offeredItem.trim() : '',
        offered_item_images: needsItem ? images : [],
        offered_service: needsService ? service.trim() : '',
        cash_amount: cashAmount,
        message: message.trim(),
        trade_mode: mode,
        shelve_id: mode === 'shelve' ? shelveId : null,
        accept_policy: true,
      })
      setSent(bid)
      setOpen(false)
      toast.success('Bid sent to the seller')
    } catch (e: any) {
      toast.error(e.message || 'Could not send your bid')
    } finally {
      setBusy(false)
    }
  }

  const modes: { key: Bid['trade_mode']; Icon: LucideIcon; t: string; s: string }[] = [
    ...(item.barter_via_shelve ? [{ key: 'shelve' as const, Icon: Store, t: 'At a shelve', s: 'Inspected by the shelve owner · escrow · shelve fee in KSh' }] : []),
    { key: 'direct', Icon: HandHelping, t: 'Directly with the seller', s: 'You meet and swap — not covered by UKO escrow' },
  ]

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary-300 bg-primary-050/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[14px] font-bold"><ArrowLeftRight size={16} className="text-primary" /> Use barter trade</span>
        <button type="button" onClick={() => setShowPolicy((p) => !p)} className="text-xs font-semibold text-primary hover:underline">{showPolicy ? 'Hide policy' : 'Policy'}</button>
      </div>
      <p className="m-0 text-xs text-ink-2">Bid with an item, a service or cash in the ranges the seller accepts. {item.barter_via_shelve ? 'Trade at a shelve (inspected, escrow) or directly with the seller.' : 'This seller trades directly only.'}</p>
      <div className="flex flex-wrap gap-1.5">
        {types.map((t) => <Chip key={t.key} size="sm" tone="primary">{t.label}</Chip>)}
        {types.length === 0 && <span className="text-xs text-muted">The seller has not picked any trade types yet.</span>}
      </div>
      {showPolicy && (
        <Notice tone="info" icon={<ShieldCheck size={15} />} title="Barter trade policy">{item.barter_policy}</Notice>
      )}

      {sent ? (
        <Notice tone="success" icon={<ShieldCheck size={15} />} title="Bid sent">
          The seller will accept or decline; track it under <Link to={'/orders' as any} className="font-semibold text-primary hover:underline">My orders</Link>.
          {sent.trade_mode === 'shelve' && sent.shelve ? ` If accepted, both items are inspected at ${sent.shelve.name}.` : ''}
          <div className="mt-2"><Button size="sm" variant="ghost" onClick={() => { reset(); setOpen(true) }}>Make another bid</Button></div>
        </Notice>
      ) : !open ? (
        !signedIn ? (
          <Link to={'/signin' as any} search={{ next: `/items/${item.id}` } as any} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary px-3.5 py-2 text-[13px] font-semibold text-primary hover:bg-primary-050"><ArrowLeftRight size={14} /> Sign in to make a bid</Link>
        ) : isOwner ? (
          <p className="m-0 text-xs text-muted">This is your item — buyers' bids show up under Seller · Bids.</p>
        ) : (
          <Button size="sm" variant="outline" className="!border-primary !text-primary" icon={<ArrowLeftRight size={14} />} disabled={types.length === 0} onClick={() => setOpen(true)}>Make a bid</Button>
        )
      ) : (
        <div className="flex flex-col gap-4 rounded-md border border-border bg-bg p-3.5">
          {/* offer type */}
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">What are you offering?</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {types.map((t) => {
                const Icon = OFFER_ICON[t.key] || Package
                const on = offerType === t.key
                return (
                  <button key={t.key} type="button" onClick={() => setOfferType(t.key)} className={cx('flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors', on ? 'border-primary bg-primary-050' : 'border-border hover:border-border-strong')}>
                    <Radio checked={on} className="mt-0.5" />
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Icon size={15} /></span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] font-bold">{t.label}</span>
                      <span className="text-[11px] text-ink-2">{OFFER_HINT[t.key]}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* fields by type */}
          {needsItem && (
            <div className="flex flex-col gap-2">
              <Input label="Item you are offering" required placeholder="e.g. Samsung Galaxy A34, 128 GB, used 6 months" value={offeredItem} onChange={(e) => setOfferedItem(e.target.value)} maxLength={255} />
              <span className="text-xs font-semibold text-ink-2">Photos of your item</span>
              <MediaUploader images={images} videos={[]} onChange={(imgs) => setImages(imgs)} max={4} />
            </div>
          )}
          {needsService && (
            <Textarea label="Service you are offering" required placeholder="e.g. Two days of plumbing work, materials not included" value={service} onChange={(e) => setService(e.target.value)} rows={3} />
          )}
          {needsCash ? (
            <Input label="Cash you add (KSh)" required type="number" min={0} inputMode="decimal" placeholder="e.g. 2,000" value={cash} onChange={(e) => setCash(e.target.value)} hint={`Listed at ${priceRange(item.min_amount, item.max_amount)} — offer cash in that range`} className="md:max-w-xs" />
          ) : (
            <p className="m-0 text-xs text-muted">Amount is 0 — no cash in this offer</p>
          )}
          <Textarea label="Bid message" placeholder="Tell the seller why this is a fair trade, when you can meet…" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />

          {/* trade mode */}
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">Where do you want to trade?</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {modes.map(({ key, Icon, t, s }) => {
                const on = mode === key
                return (
                  <button key={key} type="button" onClick={() => setMode(key)} className={cx('flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors', on ? 'border-primary bg-primary-050' : 'border-border hover:border-border-strong')}>
                    <Radio checked={on} className="mt-0.5" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[13px] font-bold"><Icon size={14} className="text-primary" /> {t}</span>
                      <span className="text-[11px] text-ink-2">{s}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {mode === 'direct' && <p className="m-0 text-[11px] text-warning">Direct trades are not inspected or covered by UKO escrow.</p>}
          </div>

          {/* shelve picker */}
          {mode === 'shelve' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold">Choose the shelve to trade at</span>
                <span className="text-[11px] text-muted">closest suggested — you pick</span>
              </div>
              {shelves === null ? (
                <span className="text-xs text-ink-2">Finding shelves near {item.ward || 'you'}…</span>
              ) : shelves.length === 0 ? (
                <span className="text-xs text-danger">{shelvesErr || 'No shelves are live right now — trade directly instead.'}</span>
              ) : (
                <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-0.5">
                  {shelves.map((s) => {
                    const on = shelveId === s.id
                    return (
                      <button key={s.id} type="button" onClick={() => setShelveId(s.id)} className={cx('flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors', on ? 'border-primary bg-primary-050' : 'border-border hover:border-border-strong')}>
                        <Radio checked={on} className="mt-0.5" />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[13px] font-bold">{s.name}</span>
                            {s.suggested && <Chip size="sm" tone="success">Suggested · {s.distance_km} km</Chip>}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-ink-2"><MapPin size={11} className="text-muted" /> {s.ward}{s.county ? ` · ${s.county}` : ''}{!s.suggested ? ` · ${s.distance_km} km` : ''}</span>
                          <span className="text-[11px] font-semibold text-primary">Shelve fee {ksh(s.barter_fee)} (included, paid in KSh)</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="m-0 text-[11px] text-muted">The seller avails their item to this shelve. The shelve owner checks both items work — if either is not usable the trade is denied.</p>
            </div>
          )}

          {/* summary + policy */}
          <div className="flex flex-col gap-1 rounded-md bg-surface px-3.5 py-3 text-[13px]">
            <span className="text-ink-2">You give: <strong className="text-ink">{give || '—'}</strong> · cash <strong className="text-ink">{ksh(cashAmount)}</strong>{mode === 'shelve' ? <> · shelve fee <strong className="text-ink">{ksh(shelveFee)}</strong></> : null} → total <strong className="font-head text-ink">{ksh(total)}</strong></span>
            <span className="text-[11px] text-muted">{total > 0 ? 'Paid in KSh only if the seller accepts.' : 'Nothing to pay — a straight swap.'}</span>
          </div>
          <Checkbox checked={accept} onChange={setAccept} label={<>I accept the <button type="button" onClick={() => setShowPolicy(true)} className="font-semibold text-primary hover:underline">barter trade policy</button></>} />
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={submit}>Send bid</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ feedback tab
function FeedbackTab({ item, feedback, onPosted, signedIn }: { item: ItemFull; feedback: ItemFull['feedback']; onPosted: () => Promise<void>; signedIn: boolean }) {
  const toast = useToast()
  const [writing, setWriting] = useState(false)
  const [rating, setRating] = useState(5)
  const [hover, setHover] = useState(0)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (message.trim().length < 2) return toast.error('Write a few words about the item')
    setBusy(true)
    try {
      await api.post(`/items/${item.id}/feedback`, { rating, message: message.trim(), media: [] })
      await onPosted()
      setMessage('')
      setWriting(false)
      toast.success('Thanks — your review is live')
    } catch (e: any) {
      toast.error(e.message || 'Could not post your review')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* Ratings summary */}
      <div className="flex flex-col gap-5">
        <h3 className="text-lg">Customer feedback</h3>
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="font-head text-[40px] font-extrabold leading-none">{feedback.average ? feedback.average.toFixed(1) : '—'}</span>
            <span className="mt-1 text-xs text-ink-2">of 5 · {feedback.count} reviews</span>
            <Stars value={feedback.average} size={14} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            {feedback.bars.map((b) => (
              <div key={b.stars} className="flex items-center gap-2 text-[11px] text-ink-2">
                <span className="w-6">{b.stars}★</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-secondary" style={{ width: `${b.pct}%` }} /></div>
                <span className="w-8 text-right">{b.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        {feedback.media.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-2">Photos &amp; videos from buyers ({feedback.media.length})</span>
            <div className="flex flex-wrap gap-2">{feedback.media.map((m, i) => <Thumb key={m + i} src={m} size={56} video={/\.(mp4|webm|mov)(\?|$)/i.test(m)} />)}</div>
          </div>
        )}
        {signedIn ? (
          writing ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <span className="text-[13px] font-bold">Your rating</span>
              <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-label={`${n} star`} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} className="p-0.5">
                    <Star size={22} className={n <= (hover || rating) ? 'fill-secondary text-secondary' : 'fill-border-strong text-border-strong'} />
                  </button>
                ))}
              </div>
              <Textarea label="Your review" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How was the item, the shelf pick-up or the delivery?" rows={4} />
              <div className="flex gap-2">
                <Button size="sm" loading={busy} onClick={submit}>Post review</Button>
                <Button size="sm" variant="ghost" onClick={() => setWriting(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setWriting(true)}>Write review</Button>
          )
        ) : (
          <Link to={'/signin' as any} search={{ next: `/items/${item.id}` } as any} className="inline-flex w-fit items-center justify-center rounded-md border border-border-strong px-3.5 py-2 text-[13px] font-semibold hover:bg-surface">Sign in to write a review</Link>
        )}
      </div>

      {/* Reviews */}
      <div className="flex flex-col">
        {feedback.reviews.length === 0 && <p className="m-0 text-sm text-ink-2">No reviews yet — be the first to share how it went.</p>}
        {feedback.reviews.map((r, i) => (
          <div key={r.id} className="flex flex-col gap-3">
            {i > 0 && <Divider className="my-5" />}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={r.name || 'Buyer'} size={36} />
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold">{r.name || 'Buyer'}</span>
                  <span className="text-[11px] text-muted">{timeAgo(r.created_at)}{r.context ? ` · ${r.context}` : r.verified_purchase ? ' · verified purchase' : ''}</span>
                </div>
              </div>
              <Stars value={r.rating} size={13} />
            </div>
            <p className="m-0 text-[13px] leading-[1.65] text-ink-2">{r.message}</p>
            {r.media.length > 0 && <div className="flex flex-wrap gap-2">{r.media.map((m, k) => <Thumb key={m + k} src={m} size={64} />)}</div>}
            {r.reply && (
              <div className="flex flex-col gap-1 rounded-md bg-surface px-3.5 py-3">
                <span className="text-[11px] font-semibold text-ink">{item.seller.name} replied{r.reply_at ? ` · ${timeAgo(r.reply_at)}` : ''}</span>
                <p className="m-0 text-[13px] leading-relaxed text-ink-2">{r.reply}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
