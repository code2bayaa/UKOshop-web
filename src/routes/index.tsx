import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Clapperboard, ImageIcon, Lock, ShieldCheck, Sparkles, Truck, Zap } from 'lucide-react'
import { api, COURIER_URL, DELIVERY_URL, publicGet, SHELVES_URL, type ItemCard, type Shelve } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { ProductCard, ProductSlot, ScrollRow, ShelfCard } from '#/components/cards'
import { Chip, LinkButton, cx } from '#/components/ui'

type Slide = { id: string; tag: string; title: string; subtitle: string; image: string; link: string }
/** GET /home/boosted · items on a live search boost bought for `county`; `fallback` = none was, so these are recent ads instead. */
type Boosted = { items: ItemCard[]; ward: string; county: string; fallback: boolean; rate_per_day: number; slots: number }
/**
 * GET /home/carousel · the hero slides for one county: the editorial ones, then the boosted ads bought for that
 * county — at most `slots` of them (3 in Nairobi). `boosted_county` is where those came from: no seller bought a
 * carousel slot in the shopper's county today, so we show Nairobi's or Mombasa's instead (`fallback`). Neither had
 * one either and `boosted` is 0 — the carousel then runs the editorial slides alone.
 */
type CarouselMeta = { slides: Slide[]; county: string; boosted_county: string; fallback: boolean; boosted: number; slots: number; rate_per_day: number }
/**
 * GET /home/for-you · the row built for one buyer out of his own orders, cart and views (back-end
 * `app/recommend.py`). `buyer` is false for a guest, and for an account that has never paid for
 * anything — there is then nothing personal to show and the row is not drawn at all. `reason` is the
 * line under each card saying why it is there, `peers` how many other buyers' baskets were compared,
 * and `topped_up` how many of the cards are shop-wide best sellers because his own signals ran out.
 */
type ForYouItem = ItemCard & { reason: string }
type ForYou = { items: ForYouItem[]; buyer: boolean; signals: Partial<Record<'purchase' | 'cart' | 'saved' | 'view', number>>; peers: number; topped_up: number; ward: string; county: string }
type Home = { carousel: Slide[]; carousel_meta: CarouselMeta; boosted: Boosted; trending: ItemCard[]; deals: ItemCard[]; deals_ward: string; shelves: Shelve[]; stats: { items_on_shelves: number; verified_sellers: number; delivered_48h_pct: number; wards_live: number } }

export const Route = createFileRoute('/')({
  loader: () => publicGet<Home>('/home'),
  component: HomePage,
})

function HomePage() {
  const data = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-10 pb-6 md:gap-14">
      <Hero data={data} />
      <ValueStrip />
      <div className="container-x flex flex-col gap-10 md:gap-14">
        <BoostedRow initial={data.boosted} />
        <ForYouRow />
        <ScrollRow title="Trending on shelves" sub="Fresh stock verified in the last 24 hours" more={{ to: '/items', search: { sort: 'relevant' } }}>
          {data.trending.map((i) => <ProductSlot key={i.id}><ProductCard item={i} /></ProductSlot>)}
        </ScrollRow>
        <ScrollRow title={`Deals near you · ${data.deals_ward} ward`} sub="Pick up from the shelf today or get it delivered" more={{ to: '/items', search: { ward: data.deals_ward } }}>
          {data.deals.map((i) => <ProductSlot key={i.id}><ProductCard item={i} /></ProductSlot>)}
        </ScrollRow>
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl md:text-2xl">Shelves near you</h2>
              <p className="m-0 text-[13px] text-ink-2">Every ward has three verified shelves — drop off, store, and deliver from there</p>
            </div>
            <LinkButton to="/shelves" variant="outline" size="sm">All shelves</LinkButton>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.shelves.map((s) => <ShelfCard key={s.id} shelve={s} />)}
          </div>
        </section>
        <section className="grad-hero flex flex-col items-start justify-between gap-5 rounded-lg p-6 text-white md:flex-row md:items-center md:p-10">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl md:text-[28px]">Own a shop, a bike or a truck? Earn with UKO.</h2>
            <p className="m-0 max-w-xl text-sm text-white/80">Host a shelf in your ward and earn 15% of every item sold off it, join the delivery pool and get paid per drop, or drive the long legs between towns as a courier.</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <LinkButton href={`${SHELVES_URL}/`} variant="secondary">Apply for a shelve</LinkButton>
            <a href={`${DELIVERY_URL}/`} className="inline-flex items-center justify-center rounded-md border border-white/40 px-[22px] py-[13px] text-sm font-semibold text-white hover:bg-white/10">Apply for delivery</a>
            <a href={`${COURIER_URL}/`} className="inline-flex items-center justify-center rounded-md border border-white/40 px-[22px] py-[13px] text-sm font-semibold text-white hover:bg-white/10">Apply as a courier</a>
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * Boosted items — ads whose seller pays the search boost (KSh 300 a county a day, 2 days by default) to sit at
 * the top of UKOshop. An ad only shows here while its paid days are still running and the shopper is in one of
 * the counties it paid to reach, and a county never shows more of them in a day than it has slots — which is
 * what makes a slot worth buying. The loader runs on the server with no session, so once the account has loaded
 * in the browser the row is fetched again with the JWT and the API reads the county off the account. Nothing
 * boosted for that county → the API sends back ads posted recently instead.
 */
function BoostedRow({ initial }: { initial: Boosted }) {
  const { user, ready } = useAuth()
  const county = user?.profile.county || ''
  const [data, setData] = useState(initial)
  useEffect(() => setData(initial), [initial])
  useEffect(() => {
    if (!ready || !county || county === initial.county) return
    let alive = true
    api.get<Boosted>('/home/boosted').then((d) => alive && setData(d)).catch(() => {})
    return () => { alive = false }
  }, [ready, county, initial.county])

  if (!data.items.length) return null
  const targeted = !data.fallback && !!data.county
  return (
    <ScrollRow
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary-050 text-secondary-600"><Zap size={15} /></span>
          {targeted ? `Boosted in ${data.county}` : 'Just added on UKOshop'}
        </span>
      }
      sub={targeted
        ? `Sellers paying KSh ${data.rate_per_day} a day to reach ${data.county} · at most ${data.slots} boosted ads run here a day`
        : data.county
          ? `No boosted ad is running in ${data.county} today — here is what sellers posted last`
          : 'Sign in so we know your county and can show what sellers boosted there'}
      more={targeted && data.ward ? { to: '/items', search: { ward: data.ward }, label: `All in ${data.ward}` } : { to: '/items', search: { sort: 'newest' }, label: 'Newest ads' }}
    >
      {data.items.map((i) => <ProductSlot key={i.id}><ProductCard item={i} /></ProductSlot>)}
    </ScrollRow>
  )
}

/**
 * "Picked for you" — the one row on this page that belongs to the person looking at it. The API ranks
 * live ads against what he has actually bought (plus his cart and the ads he opened), and against what
 * the other buyers of those items went on to buy; a seller cannot buy his way in here, unlike the row
 * above. Fetched from the browser rather than in the loader for the same reason as BoostedRow — the
 * loader runs on the server during SSR with no session, and this row is nothing without one.
 *
 * Nothing is drawn until the answer says `buyer`: a guest, or someone who has only ever browsed, has
 * given us nothing to recommend from, and an empty "Picked for you" is worse than no row at all.
 */
function ForYouRow() {
  const { user, ready } = useAuth()
  const [data, setData] = useState<ForYou | null>(null)
  useEffect(() => {
    if (!ready || !user) {
      setData(null)
      return
    }
    let alive = true
    api.get<ForYou>('/home/for-you').then((d) => alive && setData(d)).catch(() => {})
    return () => { alive = false }
  }, [ready, user?.id])

  if (!data?.buyer || !data.items.length) return null
  const bought = data.signals.purchase || 0
  return (
    <ScrollRow
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-050 text-primary"><Sparkles size={15} /></span>
          Picked for you
        </span>
      }
      sub={data.peers
        ? `From the ${bought} ${bought === 1 ? 'item' : 'items'} you have bought — and what other buyers bought with them`
        : `From the ${bought} ${bought === 1 ? 'item' : 'items'} you have bought, and what you have been looking at`}
      more={{ to: '/items', search: { sort: 'relevant' }, label: 'Browse all' }}
    >
      {data.items.map((i) => (
        <ProductSlot key={i.id}>
          <div className="flex flex-col gap-1.5">
            <ProductCard item={i} />
            <span className="flex items-start gap-1 px-0.5 text-[11px] leading-snug text-ink-2">
              <Sparkles size={11} className="mt-0.5 shrink-0 text-primary" />
              {i.reason}
            </span>
          </div>
        </ProductSlot>
      ))}
    </ScrollRow>
  )
}

function Hero({ data }: { data: Home }) {
  return (
    <section className="grad-hero w-full text-white">
      <div className="container-x grid items-center gap-8 py-9 md:grid-cols-[1fr_1.1fr] md:py-11">
        <div className="flex flex-col gap-5">
          <Chip tone="secondary" size="sm" className="w-fit bg-white/15 !text-white">UKO shop · UKOapp ad site · eden</Chip>
          <h1 className="text-[30px] leading-[1.1] tracking-tight md:text-[42px]">Sell without a shop. Buy without the risk.</h1>
          <p className="m-0 max-w-lg text-[15px] text-white/85">Drop your item at the shelf in your ward. We verify it, market it on the UKOapp ad site, and deliver it to the buyer.</p>
          <div className="flex flex-wrap gap-2.5">
            <LinkButton to="/post-ad" variant="secondary" size="lg">Post an ad</LinkButton>
            <Link to="/shelves" className="inline-flex items-center justify-center rounded-md border border-white/40 px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-white/10">Find a shelf</Link>
          </div>
          <div className="flex gap-8 border-t border-white/15 pt-5">
            {[[`${(data.stats.items_on_shelves || 18400).toLocaleString()}+`, 'items on shelves'], [(data.stats.verified_sellers || 1290).toLocaleString(), 'verified sellers'], [`${data.stats.delivered_48h_pct}%`, 'delivered in 48h']].map(([v, l]) => (
              <div key={l} className="flex flex-col">
                <span className="font-head text-2xl font-extrabold">{v}</span>
                <span className="text-xs text-white/70">{l}</span>
              </div>
            ))}
          </div>
        </div>
        <HeroCarousel initial={data.carousel_meta} fallbackSlides={data.carousel} />
      </div>
    </section>
  )
}

/**
 * The hero carousel, asked for again once the browser knows who is looking. Carousel slots are sold per county,
 * so which boosted slides belong here depends on the shopper's county — and the loader runs on the server during
 * SSR, where there is no session to read it from (same reason as BoostedRow above).
 */
function HeroCarousel({ initial, fallbackSlides }: { initial?: CarouselMeta; fallbackSlides: Slide[] }) {
  const { user, ready } = useAuth()
  const county = user?.profile.county || ''
  const [data, setData] = useState<CarouselMeta | undefined>(initial)
  useEffect(() => setData(initial), [initial])
  useEffect(() => {
    if (!ready || !county || county === initial?.county) return
    let alive = true
    api.get<CarouselMeta>('/home/carousel', { county }).then((d) => alive && setData(d)).catch(() => {})
    return () => { alive = false }
  }, [ready, county, initial?.county])
  return <Carousel slides={data?.slides || fallbackSlides} />
}

/** Hero carousel — GSAP slide transition, auto-rotates, dots + arrows. */
function Carousel({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const go = (n: number) => setI(((n % slides.length) + slides.length) % slides.length)
  useEffect(() => {
    if (slides.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 6000)
    return () => clearInterval(t)
  }, [slides.length])
  useEffect(() => {
    if (!ref.current) return
    import('gsap').then(({ gsap }) => {
      if (ref.current) gsap.fromTo(ref.current, { x: 24, opacity: 0.4 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' })
    })
  }, [i])
  const s = slides[i]
  if (!s) return null
  return (
    <div className="flex flex-col gap-3">
      <Link to={s.link as any} className="block overflow-hidden rounded-lg border border-white/15 bg-white/10 backdrop-blur">
        <div ref={ref} className="grid gap-4 p-4 md:grid-cols-[1fr_180px] md:p-5">
          <div className="flex flex-col justify-center gap-2">
            <Chip size="sm" className="w-fit bg-white/20 !text-white">{s.tag}</Chip>
            <h3 className="text-lg leading-snug md:text-[22px]">{s.title}</h3>
            <p className="m-0 text-[13px] text-white/75">{s.subtitle}</p>
          </div>
          <div className="flex h-[150px] items-center justify-center overflow-hidden rounded-md bg-white/10 md:h-[170px]">
            {s.image ? <img src={s.image} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={36} className="text-white/60" />}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {slides.map((_, n) => <button key={n} type="button" aria-label={`Slide ${n + 1}`} onClick={() => go(n)} className={cx('h-1.5 rounded-full transition-all', n === i ? 'w-6 bg-secondary' : 'w-2 bg-white/40')} />)}
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => go(i - 1)} aria-label="Previous" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 text-white hover:bg-white/10"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => go(i + 1)} aria-label="Next" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 text-white hover:bg-white/10"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}

function ValueStrip() {
  const items = [
    { Icon: ShieldCheck, t: 'Verified on arrival', s: 'Shelf agents check every item before it goes live' },
    { Icon: Truck, t: 'Ward-level delivery', s: 'Three shelves a ward keep last-mile short and cheap' },
    { Icon: Clapperboard, t: 'Boost on UKOapp ad site', s: 'KSh 500 per 1,000 views, unlimited viewers' },
    { Icon: Lock, t: 'Escrow payment', s: 'Seller is paid only after the buyer claims the item' },
  ]
  return (
    <div className="w-full border-b border-border bg-bg">
      <div className="container-x grid grid-cols-2 gap-4 py-5 md:grid-cols-4 md:gap-6">
        {items.map(({ Icon, t, s }) => (
          <div key={t} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Icon size={18} /></span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-bold">{t}</span>
              <span className="text-xs text-ink-2">{s}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
