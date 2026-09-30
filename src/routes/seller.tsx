/** 09 · Seller Items Page — seller dashboard: overview, my ads, orders, barter bids, item feedback, analytics, boosts, packages, messaging, shelves, profile, wallet. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftRight, ChartLine, ClipboardList, Crown, ImagePlus, LayoutDashboard, MapPin, Megaphone, MessageSquare, Package, PackageOpen, Pencil, Plus, Send, Store, Target, Trash2, Undo2, User as UserIcon, Wallet as WalletIcon, X } from 'lucide-react'
import { api, type BulkChannel, type ChannelUnits, type ItemCard, type ItemReturn as ItemReturnT, type MessagingBundle, type MessagingChannel, type MessagingPricing, type Package as PackageT, type PackageLine, type PackageQuote, type PackagesData, type Review, type SellerPickupJob, type Shelve, type SocialProvider, type Targeting, type User } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh, kshCents, timeAgo, STATUS_LABEL } from '#/lib/format'
import { BASE_DAYS, BASE_RATES, BASE_SLOTS, VIDEO_AD, clock, countiesOf, daysIn, fullIn, isDayChannel, slotsIn, type Availability, type DayChannel, type QuoteLine, type Rates } from '#/lib/boost'
import { Avatar, Button, Chip, CodeDigits, EmptyState, Input, LinkButton, Notice, PageLoading, ProgressBar, QtyStepper, Select, StatCard, StatusPill, Toggle, cx } from '#/components/ui'
import { DashHeader, DashboardShell, Panel, Table, Td, type NavItem } from '#/components/dashboard'
import { BarChart, Thumb } from '#/components/media'
import { WalletPanel } from '#/components/wallet'
import { MpesaPending, type MpesaPayment } from '#/components/mpesa-pending'
import { PAY_BY_MPESA, PayWith, WALLET_NAMES, canPay, usePayableWallets, type PayChoice } from '#/components/pay-with'
import { ItemReturnDialog } from '#/components/item-return'
import { usePolledRefresh } from '#/lib/poll'
import { newSocketKey } from '#/lib/sockets'
import { BULK_CHANNELS, BidsSection, MSG_CHANNELS, MessagingSection, OrdersSection, WardTargeting, channelMeta, emptyTargeting, unitsSummary, useAudience } from '#/components/seller-sections'

type Search = { tab?: string }
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
export const Route = createFileRoute('/seller')({
  validateSearch: (s: Record<string, unknown>): Search => ({ tab: str(s.tab) }),
  component: SellerPage,
})

// ---------------------------------------------------------------- types
type Range = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'
type Dash = {
  seller: { name: string; tier: string; positive_rate: number; package: string; package_features: Record<string, any>; package_info: PackageT | null }
  stats: { views: number; ads_live: number; ads_total: number; pending_verification: number; items_sold: number; revenue_net: number; revenue_gross: number; adsite_views: number; wallet: number; shelves: number; unanswered_feedback: number; pending_bids: number; new_orders: number }
  chart: { label: string; views: number; purchases: number }[]
  range: string
  locations: { ward: string; amount: number; pct: number }[]
}
/** The running return on an ad, if any — what `item_return` on GET /seller/items carries (PRD 14). */
type SellerItemReturn = ItemReturnT
type SellerItem = ItemCard & {
  variants_count: number; shelve_status: string; boost_until: string | null; handoff_code: string; boost_label: string; views?: number; adsite_views?: number
  handoff_method?: string; pickup_fee?: number; pickup_paid?: boolean; pickup_job?: SellerPickupJob | null
  /** Coming home off a shelf: the running return, whether one can be started at all, and how long it has been idle. */
  item_return?: SellerItemReturn | null; can_return?: boolean; idle_days?: number
}
type ItemsPage = { items: SellerItem[]; total: number; page: number; pages: number }
/**
 * GET /api/boost/rates — KSh per 1,000 views for the UKOapp ad site, and for the two shop channels a flat KSh per
 * county per day (300 search, 1,000 carousel) with the run length each one starts at (2 and 5 days). Every county
 * also has a number of slots a day, which is how many boosts a shopper there can see (see #/lib/boost).
 */
type BoostRates = {
  rates: Record<string, number>; labels: Record<string, string>; min_days: number
  per_1000_views?: number; view_block?: number; min_views?: number
  default_days?: Partial<Rates>; county_slots?: Record<string, Partial<Rates>>; default_slots?: Partial<Rates>
}
/** GET /api/boost/quote — cash quote for a channel / days / views / counties selection, one line per channel. */
type BoostQuote = {
  per_day: number; days_total: number; amount: number; days: Partial<Rates>
  views: number; view_blocks: number; views_total: number; counties?: string[]; channel_lines?: QuoteLine[]
  video_fine?: number
}
/** GET /items/{id}/video-ad · the ad's video against the 45 s limit, fines paid, and what ad-site viewers watched */
type VideoAd = {
  has_video: boolean; video: { seconds: number; max_seconds: number; over_seconds: number; blocks: number; per_block: number; block_seconds: number; fine: number } | null
  fines_ksh: number; views: number; avg_watch_seconds: number | null; avg_video_seconds: number | null; longest_video_seconds: number | null
}
const SECTIONS = ['overview', 'ads', 'orders', 'bids', 'feedback', 'analytics', 'boost', 'packages', 'messaging', 'shelves', 'profile', 'wallet'] as const
type Section = (typeof SECTIONS)[number]
const isSection = (s: unknown): s is Section => typeof s === 'string' && (SECTIONS as readonly string[]).includes(s)

const RANGES: { key: Range; label: string; unit: string; now: string; prev: string }[] = [
  { key: 'hourly', label: 'Hourly', unit: 'hours', now: 'this hour', prev: 'last hour' },
  { key: 'daily', label: 'Daily', unit: 'days', now: 'today', prev: 'yesterday' },
  { key: 'weekly', label: 'Weekly', unit: 'weeks', now: 'this week', prev: 'last week' },
  { key: 'monthly', label: 'Monthly', unit: 'months', now: 'this month', prev: 'last month' },
  { key: 'yearly', label: 'Yearly', unit: 'years', now: 'this year', prev: 'last year' },
]
const rangeMeta = (r: Range) => RANGES.find((x) => x.key === r) || RANGES[2]

/** Defaults mirror the back-end config; live rates from GET /api/boost/rates override them when loaded. */
const BOOST_CHANNELS: { key: string; name: string; rate: number; desc: string; byViews: boolean }[] = [
  { key: 'adsite', name: 'UKOapp ad site', rate: 0, desc: 'Unlimited viewers on the UKOapp ad site · paid per 1,000 views', byViews: true },
  { key: 'shop', name: 'UKOshop search & categories', rate: BASE_RATES.shop, desc: 'Top of search and category pages in the counties you pick', byViews: false },
  { key: 'carousel', name: 'Homepage carousel', rate: BASE_RATES.carousel, desc: 'Slot in the home carousel of the counties you pick', byViews: false },
]
const BOOST_DAYS = [1, 2, 3, 5, 7, 14, 30]
const BOOST_VIEWS = [1000, 5000, 10000, 25000, 50000]
const BOOST_DEFAULTS: BoostRates = { rates: { ...BASE_RATES }, labels: {}, min_days: 1, per_1000_views: 500, view_block: 1000, min_views: 1000, default_days: BASE_DAYS, county_slots: {}, default_slots: BASE_SLOTS }
const baseRates = (m: BoostRates): Rates => ({ shop: m.rates?.shop ?? BASE_RATES.shop, carousel: m.rates?.carousel ?? BASE_RATES.carousel })
const defaultDays = (m: BoostRates): Rates => ({ shop: m.default_days?.shop ?? BASE_DAYS.shop, carousel: m.default_days?.carousel ?? BASE_DAYS.carousel })
const slotTable = (m: BoostRates): Record<string, Partial<Rates>> => m.county_slots || {}
const viewRules = (m: BoostRates) => ({ per1000: m.per_1000_views ?? 500, block: m.view_block ?? 1000, min: m.min_views ?? 1000 })
/** Views are bought in whole blocks (KSh 500 per 1,000), minimum one block. */
const viewBlocks = (views: number, m: BoostRates) => { const r = viewRules(m); return Math.max(1, Math.ceil(Math.max(Math.round(views) || 0, r.min) / r.block)) }
/** The chip on a channel: per 1,000 views for the ad site, per county per day for a shop channel. */
const channelPrice = (m: BoostRates, key: string, rate: number) =>
  key === 'adsite'
    ? `${ksh(viewRules(m).per1000)} per ${viewRules(m).block.toLocaleString()} views`
    : `${ksh(m.rates?.[key] ?? rate)} / county / day`
// Airtel Money and card are phase 2; until those gateways are installed a service is paid by M-PESA or from a
// wallet the account already holds (#/components/pay-with).
/** KSh a day for one channel across every county the boost runs in — each county is billed, and slotted, separately. */
const channelRate = (rates: BoostRates | null, key: string, counties: string[] = []) => {
  const m = rates || BOOST_DEFAULTS
  if (key === 'adsite') return 0
  return (m.rates?.[key] ?? BOOST_DEFAULTS.rates[key] ?? 0) * Math.max(1, counties.length)
}

function pctChange(now: number, before: number): number {
  if (!before) return now ? 100 : 0
  return Math.round(((now - before) / before) * 1000) / 10
}
function trendText(now: number, before: number, prev: string) {
  const v = pctChange(now, before)
  return { text: `${v >= 0 ? '+' : ''}${v}% vs ${prev}`, down: v < 0 }
}

// ---------------------------------------------------------------- page
function SellerPage() {
  const { user, ready, refresh } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { tab } = Route.useSearch()
  const [dash, setDash] = useState<Dash | null>(null)
  const [range, setRange] = useState<Range>('weekly')
  const [loadErr, setLoadErr] = useState('')
  const [active, setActive] = useState<Section>(() => (isSection(tab) ? tab : 'overview'))
  const [syncedAt, setSyncedAt] = useState('')

  // `/seller?tab=orders` / `?tab=bids` (notification links) open that section, also when already on the page.
  useEffect(() => {
    if (isSection(tab)) setActive(tab)
  }, [tab])
  const select = (k: string) => {
    if (!isSection(k)) return
    setActive(k)
    navigate({ to: '/seller', search: { tab: k === 'overview' ? undefined : k } as any, replace: true })
  }
  const [rates, setRates] = useState<BoostRates | null>(null)
  const [counties, setCounties] = useState<string[]>([])   // boosts are bought, billed and slotted by county
  const [shelves, setShelves] = useState<Shelve[] | null>(null)
  const [boostItem, setBoostItem] = useState<SellerItem | null>(null)
  const [adsKey, setAdsKey] = useState(0)

  // Signed out -> sign in. Signed in but not yet a seller (no ad posted) -> the post-ad form, which is
  // what makes him one; the dashboard is hidden from the menus until then.
  useEffect(() => {
    if (!ready) return
    if (!user) navigate({ to: '/signin' as any, search: { next: '/seller' } as any })
    else if (!user.roles.seller) navigate({ to: '/post-ad' as any, replace: true })
  }, [ready, user, navigate])

  /** When he last cleared a count here — a fetch that left before that is carrying the old number. */
  const clearedAt = useRef(0)

  /** `silent`: a background count refresh — a blip there must not replace the page he is working on. */
  const loadDash = async (r: Range = range, silent = false) => {
    const startedAt = Date.now()
    try {
      const fresh = await api.get<Dash>('/seller/dashboard', { range: r })
      if (clearedAt.current <= startedAt) setDash(fresh)  // else: it would put the cleared bid / reply back
      setSyncedAt(new Date().toISOString())
      setLoadErr('')
    } catch (e: any) {
      if (!silent) setLoadErr(e.message || 'Could not load the seller dashboard')
    }
  }

  /** Take one off a sidebar count the moment he clears it, instead of after the dashboard refetch. */
  const takeOne = useCallback((key: 'pending_bids' | 'unanswered_feedback' | 'new_orders') => {
    clearedAt.current = Date.now()
    setDash((d) => (d && d.stats[key] > 0 ? { ...d, stats: { ...d.stats, [key]: d.stats[key] - 1 } } : d))
  }, [])
  const orderSeen = useCallback(() => takeOne('new_orders'), [takeOne])
  const loadBoostMeta = () => {
    api.get<BoostRates>('/boost/rates').then(setRates).catch(() => setRates(BOOST_DEFAULTS))
    api.get<{ counties?: string[] }>('/wards').then((r) => setCounties(r.counties || [])).catch(() => {})
  }
  const loadShelves = async () => {
    try {
      setShelves(await api.get<Shelve[]>('/seller/shelves'))
    } catch {
      setShelves([])
    }
  }
  useEffect(() => {
    if (user) loadDash(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, range])
  useEffect(() => {
    if (user) {
      loadBoostMeta()
      loadShelves()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // An order or a bid can land while he sits on this page, so re-check the counts every 30 s
  // (paused while the tab is hidden — see poll.ts), the same way the nav badges do.
  const pollCounts = useCallback(() => {
    if (!user) return
    loadDash(range, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, range])
  usePolledRefresh(pollCounts)


  if (!ready || !user) return <PageLoading />
  if (loadErr) {
    return (
      <div className="container-x py-10">
        <Notice tone="warning" icon={<Package size={16} />} title="Seller dashboard unavailable" action={<Button size="sm" variant="outline" onClick={() => loadDash()}>Retry</Button>}>{loadErr}</Notice>
      </div>
    )
  }
  if (!dash) return <PageLoading />

  const { seller, stats } = dash
  const meta = rangeMeta(range)
  const nav: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'ads', label: 'My ads', icon: Package, badge: stats.ads_total },
    { key: 'orders', label: 'Orders', icon: ClipboardList, badge: stats.new_orders },
    { key: 'bids', label: 'Barter bids', icon: ArrowLeftRight, badge: stats.pending_bids },
    { key: 'feedback', label: 'Item feedback', icon: MessageSquare, badge: stats.unanswered_feedback },
    { key: 'analytics', label: 'Analytics', icon: ChartLine },
    { key: 'boost', label: 'Boost ads', icon: Megaphone },
    { key: 'packages', label: 'Seller packages', icon: Crown },
    { key: 'messaging', label: 'Messaging', icon: Send },
    { key: 'shelves', label: 'Shelve locations', icon: Store },
    { key: 'profile', label: 'Profile & account', icon: UserIcon },
    { key: 'wallet', label: 'Wallet', icon: WalletIcon },
  ]

  const afterBoost = async () => {
    setBoostItem(null)
    setAdsKey((k) => k + 1)
    await loadDash()
  }
  const reportShelve = async (s: Shelve) => {
    const reason = window.prompt(`Report ${s.name} — what went wrong?`, '')
    if (reason === null) return
    try {
      await api.post(`/seller/shelves/${s.id}/report`, { reason })
      toast.success('Report sent — the UKO shelf team will follow up')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const brand = (
    <div className="flex items-center gap-2.5">
      <Avatar name={seller.name} src={user.profile.avatar || undefined} size={38} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-head text-[13px] font-bold text-ink">{seller.name}</span>
        <span className="truncate text-[10px] text-muted">{seller.tier} · {seller.positive_rate}% positive</span>
      </div>
    </div>
  )
  const headerSub = `${stats.ads_live} live ad${stats.ads_live === 1 ? '' : 's'} · ${stats.shelves} shel${stats.shelves === 1 ? 'f' : 'ves'} · last sync ${timeAgo(syncedAt) || 'just now'}`
  const adsPanel = <AdsPanel key={adsKey} pending={stats.pending_verification} onBoost={setBoostItem} onChanged={() => loadDash()} />
  const shelvesList = <ShelvesList shelves={shelves} onReport={reportShelve} />

  return (
    <DashboardShell brand={brand} nav={nav} active={active} onSelect={select} cta={<LinkButton to="/post-ad" full>Post ad</LinkButton>}>
      {active === 'overview' && (
        <>
          <DashHeader title="Seller overview" sub={headerSub} actions={<RangeToggle value={range} onChange={setRange} />} />
          <StatsRow dash={dash} range={range} />
          <AnalyticsRow dash={dash} range={range} />
          {adsPanel}
          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <FeedbackPanel unanswered={stats.unanswered_feedback} limit={3} onChanged={() => { takeOne('unanswered_feedback'); loadDash() }} action={<Button variant="ghost" size="sm" onClick={() => select('feedback')}>View all</Button>} />
            <ProfilePanel user={user} onSaved={refresh} extra={<div className="flex flex-col gap-2.5"><span className="text-xs font-bold text-ink">My shelve locations</span>{shelvesList}</div>} />
          </div>
        </>
      )}

      {active === 'ads' && (
        <>
          <DashHeader title="My ads" sub={`${stats.ads_total} ads · ${stats.ads_live} live · ${stats.pending_verification} awaiting shelf verification`} actions={<LinkButton to="/post-ad" size="sm">Post ad</LinkButton>} />
          {adsPanel}
        </>
      )}

      {active === 'orders' && (
        <>
          <DashHeader title="Orders" sub="Every paid order and accepted barter trade on your ads · cash lands in your wallet after the 20% commission once the buyer claims or confirms delivery" />
          <OrdersSection onChanged={() => loadDash()} onSeen={orderSeen} />
        </>
      )}

      {active === 'bids' && (
        <>
          <DashHeader title="Barter bids" sub={`${stats.pending_bids} pending offer${stats.pending_bids === 1 ? '' : 's'} · accept to create the order; shelf trades are inspected by the shelf owner before hand-over`} />
          <BidsSection onChanged={() => { takeOne('pending_bids'); loadDash() }} />
        </>
      )}

      {active === 'feedback' && (
        <>
          <DashHeader title="Item feedback" sub={`${stats.unanswered_feedback} unanswered · buyers get a notification when you reply`} />
          <FeedbackPanel unanswered={stats.unanswered_feedback} onChanged={() => { takeOne('unanswered_feedback'); loadDash() }} />
        </>
      )}

      {active === 'analytics' && (
        <>
          <DashHeader title="Analytics" sub={`Views, purchases and buyer locations · ${meta.label.toLowerCase()} buckets`} actions={<RangeToggle value={range} onChange={setRange} />} />
          <StatsRow dash={dash} range={range} />
          <AnalyticsRow dash={dash} range={range} />
        </>
      )}

      {active === 'boost' && (
        <>
          <DashHeader title="Boost ads" sub="Pay per 1,000 views to put your ads in front of unlimited viewers on the UKOapp ad site, or per day at the top of shop results and in the home carousel" />
          <BoostSection rates={rates} county={user.profile.county || ''} onBoost={setBoostItem} refreshKey={adsKey} />
        </>
      )}

      {active === 'packages' && (
        <>
          <DashHeader title="Seller packages" sub="Pay per message — buy SMS, e-mail, WhatsApp and social post units that never expire · posts are published on UKOshop's X, Facebook and Instagram accounts" />
          <PackagesSection user={user} onSaved={async () => { await Promise.all([refresh(), loadDash()]) }} onGoMessaging={() => select('messaging')} />
        </>
      )}

      {active === 'messaging' && (
        <>
          <DashHeader title="Messaging" sub="E-mail, SMS, WhatsApp or push your buyers, or post your ads on UKOshop's X, Facebook and Instagram accounts · pay per message from your units" />
          <MessagingSection onGoPackages={() => select('packages')} />
        </>
      )}

      {active === 'shelves' && (
        <>
          <DashHeader title="Shelve locations" sub="Shelves that hold your items · 3 shelves per ward · the shelf owner verifies each item before it goes live" />
          <Panel title="My shelve locations" sub={`${shelves?.length ?? 0} shel${shelves?.length === 1 ? 'f' : 'ves'} · report a shelf if an item was mishandled`}>
            {shelvesList}
          </Panel>
        </>
      )}

      {active === 'profile' && (
        <>
          <DashHeader title="Profile & account" sub="Your store name shows on every ad · changing your email needs a code sent to your phone" />
          <div className="grid gap-4 xl:grid-cols-[560px_1fr]">
            <ProfilePanel user={user} onSaved={refresh} />
            <Panel title="Store preview" sub="What buyers see on your ads">
              <div className="flex items-center gap-3">
                <Avatar name={seller.name} src={user.profile.avatar || undefined} size={48} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-head text-base font-extrabold text-ink">{seller.name}</span>
                  <span className="text-xs text-ink-2">{seller.tier} · {seller.positive_rate}% positive · {stats.items_sold} sold · joined {user.profile.joined_year}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip size="sm" tone="primary">{user.email}</Chip>
                <Chip size="sm">{user.telephone}</Chip>
                {user.profile.location && <Chip size="sm">{user.profile.location}</Chip>}
              </div>
            </Panel>
          </div>
        </>
      )}

      {active === 'wallet' && (
        <>
          <DashHeader title="Wallet" sub="Sales land here after the 20% UKO commission · withdraw to M-PESA any time (minimum KSh 100)" />
          <WalletPanel
            role="seller"
            methods={['mpesa']}
            intro={
              <Notice tone="info" icon={<WalletIcon size={16} />} title="How your seller wallet fills up">
                Every sale is held in escrow and released to this wallet, after the 20% UKO commission, the moment the buyer claims the item at the shelf (ID + their shelf code) or confirms delivery with the rider's 4-digit code. Spend it on boosts, messaging packages and AI prompts for nothing, or withdraw it to M-PESA whenever the balance is KSh 100 or more — a withdrawal keeps a 10% UKO fee.
              </Notice>
            }
          />
        </>
      )}

      {boostItem && <BoostDialog item={boostItem} rates={rates} counties={counties} adCounty={user.profile.county || ''} defaultPhone={user.profile.mpesa_number || user.telephone || ''} onClose={() => setBoostItem(null)} onDone={afterBoost} />}
    </DashboardShell>
  )
}

// ---------------------------------------------------------------- Range toggle
function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="no-scrollbar flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-surface-2 p-[3px]">
      {RANGES.map((r) => (
        <button key={r.key} type="button" onClick={() => onChange(r.key)} className={cx('whitespace-nowrap rounded-[7px] px-[13px] py-2 text-xs transition-colors', value === r.key ? 'bg-bg font-bold text-ink shadow-card' : 'font-medium text-muted hover:text-ink')}>{r.label}</button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Stats
function StatsRow({ dash, range }: { dash: Dash; range: Range }) {
  const { stats, chart } = dash
  const meta = rangeMeta(range)
  const last = chart[chart.length - 1]
  const prev = chart[chart.length - 2]
  const views = trendText(last?.views ?? 0, prev?.views ?? 0, meta.prev)
  const sold = trendText(last?.purchases ?? 0, prev?.purchases ?? 0, meta.prev)
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 2xl:grid-cols-7">
      <StatCard label={`Views ${meta.now}`} value={stats.views.toLocaleString()} trend={views.text} trendDown={views.down} />
      <StatCard label="Ads live" value={stats.ads_live} trend={`${stats.pending_verification} awaiting verification`} trendDown={stats.pending_verification > 0} />
      <StatCard label="Items sold" value={stats.items_sold.toLocaleString()} trend={sold.text} trendDown={sold.down} />
      <StatCard label="Revenue (after 20%)" value={ksh(stats.revenue_net)} trend={`${ksh(stats.revenue_gross)} gross`} />
      <StatCard label="Wallet" value={ksh(stats.wallet)} trend="Withdraw to M-PESA · min KSh 100" />
      <StatCard label="Pending bids" value={stats.pending_bids.toLocaleString()} trend={stats.pending_bids > 0 ? 'Barter offers waiting for you' : 'No offers waiting'} trendDown={stats.pending_bids > 0} />
      <StatCard label="Ad site views" value={(stats.adsite_views ?? 0).toLocaleString()} trend="Views on the UKOapp ad site" />
    </div>
  )
}

// ---------------------------------------------------------------- Analytics
function AnalyticsRow({ dash, range }: { dash: Dash; range: Range }) {
  const meta = rangeMeta(range)
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Panel title="Views & purchases" sub={`Last ${dash.chart.length} ${meta.unit} · boosted ${meta.unit} highlighted`}>
        <BarChart data={dash.chart} series={[{ key: 'views', label: 'Views', color: '#2F44A8' }, { key: 'purchases', label: 'Purchases', color: '#FF7A45' }]} height={200} />
      </Panel>
      <Panel title="Where buyers are" sub="Paid orders by buyer ward">
        {dash.locations.length === 0 ? (
          <p className="m-0 text-[13px] text-ink-2">No paid orders yet. Once buyers start ordering, their wards show up here so you can pick where to boost.</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {dash.locations.map((l) => (
              <div key={l.ward} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs font-semibold text-ink">{l.ward}</span>
                  <span className="whitespace-nowrap text-[11px] text-ink-2">{ksh(l.amount)} · {l.pct}%</span>
                </div>
                <ProgressBar value={l.pct} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------- My ads
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'pending', label: 'Pending' },
  { key: 'paused', label: 'Paused' },
  { key: 'sold_out', label: 'Sold out' },
]

function AdsPanel({ pending, onBoost, onChanged }: { pending: number; onBoost: (i: SellerItem) => void; onChanged: () => void }) {
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ItemsPage | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const load = async () => {
    try {
      setData(await api.get<ItemsPage>('/seller/items', { status: filter, page }))
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page])
  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach(clearTimeout)
  }, [])

  const patchRow = (id: number, patch: Partial<SellerItem>) => setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : d))

  const setStock = (it: SellerItem, stock: number) => {
    patchRow(it.id, { stock })
    clearTimeout(timers.current[it.id])
    timers.current[it.id] = setTimeout(async () => {
      try {
        const r = await api.patch<ItemCard>(`/seller/items/${it.id}`, { stock })
        patchRow(it.id, { stock: r.stock, status: r.status })
        onChanged()
      } catch (e: any) {
        toast.error(e.message || 'Could not update the quantity')
        load()
      }
    }, 500)
  }

  const toggleStatus = async (it: SellerItem) => {
    if (it.status !== 'live' && it.status !== 'paused') return
    const next = it.status === 'live' ? 'paused' : 'live'
    setBusy(it.id)
    try {
      const r = await api.patch<ItemCard>(`/seller/items/${it.id}`, { status: next })
      patchRow(it.id, { status: r.status })
      toast.success(r.status === 'paused' ? 'Ad paused — buyers no longer see it' : r.status === 'live' ? 'Ad is live again' : 'Ad is sold out — add stock to go live')
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  /**
   * Get the item back off the shelf (PRD 14). There are five ways home and which ones this item may take
   * depends on where it is and how long it has sat there, so the choice is a dialog rather than a confirm:
   * the API prices every option and says why the ones it refuses are refused (#/components/item-return).
   */
  const [returning, setReturning] = useState<SellerItem | null>(null)

  /** Call a paid return back while nobody has collected it — the fee goes to the wallet that paid for it. */
  const cancelReturn = async (it: SellerItem) => {
    const r = it.item_return
    if (!r) return
    if (!window.confirm(`Call ${r.return_no} back?\n\n"${it.title}" stays on the shelf and ${r.fee > 0 ? `the ${ksh(r.fee)} is refunded to the wallet that paid for it` : 'nothing is charged'}.`)) return
    setBusy(it.id)
    try {
      await api.post(`/seller/returns/${r.id}/cancel`, { reason: 'the seller called it back' })
      toast.success(`${r.return_no} called back — "${it.title}" is back on the shelf.`)
      await load()
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (it: SellerItem) => {
    if (!window.confirm(`Delete "${it.title}"? Buyers will no longer see this ad.`)) return
    setBusy(it.id)
    try {
      await api.del(`/items/${it.id}`)
      toast.success('Ad deleted')
      await load()
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  return (
    <Panel
      title="My ads"
      sub={`${total} ad${total === 1 ? '' : 's'} · ${pending} awaiting shelf verification · edit quantity inline, changes sync to the shelve · free shelf storage runs out after two months, and the item then sells directly from you`}
      action={
        <div className="no-scrollbar flex max-w-full gap-2 overflow-x-auto">
          {FILTERS.map((f) => <Chip key={f.key} size="sm" active={filter === f.key} onClick={() => { setFilter(f.key); setPage(1) }}>{f.label}</Chip>)}
        </div>
      }
      padded={false}
    >
      {!data ? (
        <div className="p-5"><PageLoading /></div>
      ) : items.length === 0 ? (
        <div className="p-5"><EmptyState icon={<Package size={26} />} title={filter === 'all' ? 'No ads yet' : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} ads`} sub="Post an ad, drop the item at the shelf in your ward and UKO markets it for you." action={filter === 'all' ? <LinkButton to="/post-ad" size="sm">Post your first ad</LinkButton> : undefined} /></div>
      ) : (
        <Table head={['Item', 'Price', 'Stock / quantity', 'Status', 'Views', 'Boost', 'Actions']}>
          {items.map((it) => {
            const toggleable = it.status === 'live' || it.status === 'paused'
            return (
              <tr key={it.id} className={cx(busy === it.id && 'opacity-60')}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Thumb src={it.image} size={42} />
                    <div className="flex min-w-0 max-w-[280px] flex-col gap-0.5">
                      <Link to="/items/$id" params={{ id: String(it.id) }} className="truncate text-xs font-semibold text-ink hover:text-primary">{it.title}</Link>
                      <span className="truncate text-[10px] text-muted">{it.variants_count} variant{it.variants_count === 1 ? '' : 's'} · {it.shelve_name || 'No shelf yet'}</span>
                      {it.handoff_method === 'agent' && it.pickup_job && <PickupTrip job={it.pickup_job} shelf={it.shelve_name || 'the shelf'} handoffCode={it.handoff_code} />}
                      {it.item_return && <ItemComingHome ret={it.item_return} />}
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-xs font-bold text-ink">{ksh(it.min_amount)}</Td>
                <Td>
                  <span className={cx(it.stock === 0 && '[&_span]:text-danger')}>
                    <QtyStepper size="sm" min={0} max={9999} value={it.stock} onChange={(v) => setStock(it, v)} />
                  </span>
                </Td>
                <Td>
                  <button type="button" disabled={!toggleable || busy === it.id} onClick={() => toggleStatus(it)} title={toggleable ? (it.status === 'live' ? 'Pause this ad' : 'Set live') : undefined} className={cx('rounded-full', toggleable ? 'cursor-pointer hover:opacity-80' : 'cursor-default')}>
                    <StatusPill status={it.status} label={STATUS_LABEL[it.status]} />
                  </button>
                </Td>
                <Td className="text-xs text-ink-2">{it.views !== undefined ? it.views.toLocaleString() : '—'}</Td>
                <Td className={cx('whitespace-nowrap text-[11px]', it.boosted ? 'text-secondary-600' : 'text-muted')}>{it.boost_label}</Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <Link to="/post-ad" search={{ edit: it.id } as any} aria-label="Edit ad" title="Edit" className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-surface text-ink-2 hover:text-primary"><Pencil size={13} /></Link>
                    <button type="button" aria-label="Boost ad" title="Boost" onClick={() => onBoost(it)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-surface text-ink-2 hover:text-secondary"><Megaphone size={13} /></button>
                    {it.item_return
                      ? <button type="button" aria-label="Cancel the return" title={`${it.item_return.return_no} · ${it.item_return.label} — tap to call it back`} disabled={busy === it.id} onClick={() => cancelReturn(it)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-warning-050 text-warning hover:opacity-80"><Undo2 size={13} /></button>
                      : it.can_return && <button type="button" aria-label="Get it back off the shelf" title={`Get it back off ${it.shelve_name || 'the shelf'} — collect it, keep it there, or have it brought to you`} disabled={busy === it.id} onClick={() => setReturning(it)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-surface text-ink-2 hover:text-warning"><PackageOpen size={13} /></button>}
                    <button type="button" aria-label="Delete ad" title="Delete" disabled={busy === it.id} onClick={() => remove(it)} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-danger-050 text-danger hover:opacity-80"><Trash2 size={13} /></button>
                  </div>
                </Td>
              </tr>
            )
          })}
        </Table>
      )}
      {data && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3">
          <span className="text-[11px] text-muted">Showing {items.length} of {total} ads</span>
          <Pager page={data.page} pages={data.pages} onChange={setPage} />
        </div>
      )}
      {returning && (
        <ItemReturnDialog
          itemId={returning.id} title={returning.title} shelfName={returning.shelve_name || 'the shelf'}
          onClose={() => { setReturning(null); void load() }}
          onDone={() => { void load(); onChanged() }}
        />
      )}
    </Panel>
  )
}

/**
 * ItemComingHome — the one-line state of an item on its way back to the seller, under its row in the ads table.
 * The mirror of `PickupTrip`, which says the same thing about the trip out. The 4-digit code is the seller's and
 * is shown only once a rider actually has the item: it is what he reads out on the doorstep, and reading it out
 * any earlier is how a parcel walks away.
 */
function ItemComingHome({ ret }: { ret: SellerItemReturn }) {
  const leg = [...(ret.legs ?? [])].reverse().find((l) => l.status !== 'cancelled')
  const tone = ret.status === 'delivered' ? 'text-success' : ret.status === 'cancelled' ? 'text-muted' : 'text-warning'
  const line = ret.status === 'delivered' ? 'Home'
    : ret.status === 'cancelled' ? `Called back${ret.cancelled_reason ? ` — ${ret.cancelled_reason}` : ''}`
    : !leg ? 'Waiting for payment'
    : leg.status === 'offered' ? `${leg.type === 'rider' ? 'Looking for a rider' : 'On the courier board'} · ${leg.no}`
    : leg.status === 'accepted' ? `${leg.type === 'rider' ? leg.rider?.name || 'A rider' : leg.driver?.name || 'A driver'} is on the way · ${leg.no}`
    : leg.status === 'collected' || leg.status === 'in_transit' ? `In hand, coming to you · ${leg.no}`
    : `${leg.no} · ${leg.status}`
  return (
    <span className={cx('flex flex-wrap items-center gap-1.5 text-[10px]', tone)}>
      <PackageOpen size={11} className="shrink-0" />
      <span className="truncate">{ret.return_no} · {ret.label} — {line}</span>
      {leg?.seller_code && (leg.status === 'collected' || leg.status === 'accepted') && (
        <span className="text-muted">code <b className="font-head tracking-[0.15em] text-ink">{leg.seller_code}</b> on the doorstep</span>
      )}
    </span>
  )
}

/**
 * Where the UKO rider taking this item to the shelf has got to. Until he collects it the seller sees his rider code:
 * he reads it to the rider at hand-over, which proves the rider has the item. The shelf checks it in with the other
 * code, the hand-off code, and that check-in is what pays the rider. A cancelled trip shows nothing.
 */
function PickupTrip({ job, shelf, handoffCode }: { job: SellerPickupJob; shelf: string; handoffCode: string }) {
  if (job.status === 'cancelled') return null
  const rider = job.rider ? `${job.rider.name}${job.rider.phone ? ` (${job.rider.phone})` : ''}` : 'A rider'
  const waiting = job.status === 'offered' || job.status === 'accepted'
  const line = job.status === 'offered' ? 'Waiting for a rider'
    : job.status === 'accepted' ? `Rider ${rider} is coming — give them code ${job.seller_code}`
    : job.status === 'collected' ? `Collected by ${job.rider?.name || 'the rider'} · on the way to ${shelf}`
    : 'Checked in at the shelf · rider paid'
  return (
    <div className="mt-1 flex flex-col gap-1 rounded-sm border border-border bg-surface px-2 py-1.5">
      <span className={cx('whitespace-normal text-[10px] font-semibold', job.status === 'delivered' ? 'text-success' : 'text-ink-2')}>{line}</span>
      {waiting && job.seller_code && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-ink">Rider code</span>
            <CodeDigits value={job.seller_code} length={4} size="sm" />
          </div>
          <span className="whitespace-normal text-[10px] leading-[1.5] text-muted">
            Read it to the rider when you hand the item over — it proves they collected it. The hand-off code{handoffCode ? ` (${handoffCode})` : ''} is for the shelf.
          </span>
        </>
      )}
    </div>
  )
}

function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  const start = Math.max(1, Math.min(page - 1, pages - 2))
  const nums: number[] = []
  for (let n = start; n <= Math.min(pages, start + 2); n++) nums.push(n)
  const box = 'flex h-7 w-7 items-center justify-center rounded-sm border border-border text-[11px] font-semibold transition-colors disabled:opacity-40'
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} className={cx(box, 'bg-bg text-ink-2 hover:bg-surface-2')}>‹</button>
      {nums.map((n) => <button key={n} type="button" onClick={() => onChange(n)} className={cx(box, n === page ? 'border-primary bg-primary text-white' : 'bg-bg text-ink-2 hover:bg-surface-2')}>{n}</button>)}
      <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)} className={cx(box, 'bg-bg text-ink-2 hover:bg-surface-2')}>›</button>
    </div>
  )
}

// ---------------------------------------------------------------- Item feedback
function FeedbackPanel({ unanswered, limit, onChanged, action }: { unanswered: number; limit?: number; onChanged: () => void; action?: ReactNode }) {
  const toast = useToast()
  const [rows, setRows] = useState<Review[] | null>(null)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    api.get<Review[]>('/seller/feedback').then(setRows).catch((e) => toast.error(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = async (r: Review) => {
    const reply = (drafts[r.id] || '').trim()
    if (!reply) return
    setBusy(r.id)
    try {
      const u = await api.post<Review>(`/seller/feedback/${r.id}/reply`, { reply })
      setRows((rs) => (rs ? rs.map((x) => (x.id === u.id ? u : x)) : rs))
      setDrafts((d) => ({ ...d, [r.id]: '' }))
      toast.success('Reply sent — the buyer has been notified')
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const sorted = rows ? [...rows].sort((a, b) => Number(!!a.reply) - Number(!!b.reply)) : []
  const list = limit ? sorted.slice(0, limit) : sorted

  return (
    <Panel title="Item feedback" action={<div className="flex items-center gap-2">{unanswered > 0 && <Chip size="sm" tone="danger">{unanswered} unanswered</Chip>}{action}</div>}>
      {!rows ? (
        <PageLoading />
      ) : list.length === 0 ? (
        <EmptyState icon={<MessageSquare size={26} />} title="No feedback yet" sub="Buyer questions and reviews on your ads land here. Quick replies lift your positive rate." />
      ) : (
        <div className="flex flex-col gap-3.5">
          {list.map((r) => (
            <div key={r.id} className="flex flex-col gap-2.5 rounded-md bg-surface p-3.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={r.name || 'Buyer'} size={28} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-bold text-ink">{r.name || 'Buyer'}</span>
                  <span className="truncate text-[10px] text-muted">{r.item_title}{r.created_at ? ` · ${timeAgo(r.created_at)}` : ''}</span>
                </div>
                <Chip size="sm" tone={r.reply ? 'success' : 'warning'}>{r.reply ? 'Replied' : 'Unanswered'}</Chip>
              </div>
              <p className="m-0 text-[11px] leading-[1.6] text-ink-2">{r.message}</p>
              {r.reply ? (
                <div className="rounded-sm border border-border bg-bg px-3 py-2 text-[11px] leading-[1.6] text-ink-2">
                  <span className="font-semibold text-ink">You replied{r.reply_at ? ` · ${timeAgo(r.reply_at)}` : ''}: </span>{r.reply}
                </div>
              ) : (
                <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(r) }}>
                  <Input placeholder="Write a reply…" className="flex-1" value={drafts[r.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))} />
                  <Button type="submit" size="sm" icon={<Send size={13} />} loading={busy === r.id} disabled={!(drafts[r.id] || '').trim()}>Send</Button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- Boost
function BoostSection({ rates, county, onBoost, refreshKey }: { rates: BoostRates | null; county: string; onBoost: (i: SellerItem) => void; refreshKey: number }) {
  const toast = useToast()
  const [live, setLive] = useState<SellerItem[] | null>(null)
  const meta = rates || BOOST_DEFAULTS

  useEffect(() => {
    api.get<ItemsPage>('/seller/items', { status: 'live', page: 1, per_page: 50 }).then((r) => setLive(r.items)).catch((e) => toast.error(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Panel title="Boost pricing" sub="Cash per channel · the UKOapp ad site per 1,000 views, the shop channels per day in each county you target">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 text-[13px] text-ink-2">
            {BOOST_CHANNELS.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 rounded-md bg-surface px-3 py-2.5">
                <div className="flex min-w-0 flex-col"><span className="font-semibold text-ink">{meta.labels?.[c.key] || c.name}</span><span className="text-[11px] text-muted">{c.desc}</span></div>
                <Chip size="sm" tone="secondary" className="whitespace-nowrap">{channelPrice(meta, c.key, c.rate)}</Chip>
              </div>
            ))}
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[12px] text-ink-2">
            <li className="flex gap-2"><span className="text-success">✓</span><span>UKOapp ad site: {ksh(viewRules(meta).per1000)} per {viewRules(meta).block.toLocaleString()} views — the ad runs until the views are used up</span></li>
            <li className="flex gap-2"><span className="text-success">✓</span><span>
              The shop channels are bought by county, at the same rate everywhere: {ksh(baseRates(meta).carousel)} a day for a carousel slot, {ksh(baseRates(meta).shop)} for search · pick three counties and you pay for three, because the ad runs in all three
            </span></li>
            <li className="flex gap-2"><span className="text-success">✓</span><span>
              They run for different lengths: {defaultDays(meta).shop} days on search and {defaultDays(meta).carousel} in the carousel to start with, and you can set any number of days from {meta.min_days}
            </span></li>
            <li className="flex gap-2"><span className="text-success">✓</span><span>
              A county shows only so many boosts a day{county ? ` — ${slotsIn(county, 'carousel', slotTable(meta), BASE_SLOTS)} carousel and ${slotsIn(county, 'shop', slotTable(meta), BASE_SLOTS)} search slots in ${county}` : ''}. Once they are taken the boost cannot be bought there until tomorrow.
            </span></li>
            <li className="flex gap-2"><span className="text-success">✓</span><span>Paid per boost by M-PESA</span></li>
          </ul>
          <p className="m-0 text-[11px] text-muted">Payment is simulated until the payment gateways are configured — a real M-PESA prompt goes to your phone in production.</p>
        </div>
      </Panel>
      <Panel title="Live ads" sub="Pick an ad to boost · pending and paused ads cannot be boosted" padded={false}>
        {!live ? (
          <div className="p-5"><PageLoading /></div>
        ) : live.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Megaphone size={26} />} title="No live ads to boost" sub="Ads go live once the shelf owner verifies them." action={<LinkButton to="/post-ad" size="sm">Post ad</LinkButton>} /></div>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {live.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-5 py-3">
                <Thumb src={it.image} size={44} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold text-ink">{it.title}</span>
                  <span className="truncate text-[11px] text-muted">{ksh(it.min_amount)} · {it.stock} in stock · {(it.adsite_views ?? 0).toLocaleString()} ad site views · <span className={it.boosted ? 'text-secondary-600' : ''}>{it.boost_label}</span></span>
                </div>
                <Button size="sm" variant={it.boosted ? 'outline' : 'secondary'} icon={<Megaphone size={13} />} onClick={() => onBoost(it)}>{it.boosted ? 'Extend' : 'Boost'}</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function BoostDialog({ item, rates, counties, adCounty, defaultPhone, onClose, onDone }: { item: SellerItem; rates: BoostRates | null; counties: string[]; adCounty: string; defaultPhone: string; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast()
  const meta = rates || BOOST_DEFAULTS
  const [channels, setChannels] = useState<string[]>(['adsite'])
  // one run length per shop channel — a search push is short, a carousel slot is booked for longer
  const [days, setDays] = useState<Partial<Rates>>({})
  const [views, setViews] = useState(() => viewRules(rates || BOOST_DEFAULTS).min)
  const [picked, setPicked] = useState<string[]>(() => (adCounty && counties.includes(adCounty) ? [adCounty] : []))
  const [countyQuery, setCountyQuery] = useState('')
  // A boost is paid by M-PESA or straight out of a wallet the account already holds (seller / shelf / delivery).
  const [pay, setPay] = useState<PayChoice>(PAY_BY_MPESA)
  const wallets = usePayableWallets()
  const [phone, setPhone] = useState(defaultPhone)
  const [quote, setQuote] = useState<BoostQuote | null>(null)
  const [slotsLeft, setSlotsLeft] = useState<Availability[]>([])
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<MpesaPayment | null>(null)
  const [videoAd, setVideoAd] = useState<VideoAd | null>(null)
  useEffect(() => {
    let alive = true
    api.get<VideoAd>(`/items/${item.id}/video-ad`).then((r) => alive && setVideoAd(r)).catch(() => {})
    return () => { alive = false }
  }, [item.id])

  // Local estimate so the total never flickers while the server quote (debounced) is on its way.
  const onAdsite = channels.includes('adsite')
  const onDayChannel = channels.some((k) => k !== 'adsite')
  const blocks = onAdsite ? viewBlocks(views, meta) : 0
  const paidViews = blocks * viewRules(meta).block
  const viewsTotal = blocks * viewRules(meta).per1000
  // The counties this boost runs in — each is billed per day and takes one of that county's slots.
  const where = countiesOf(picked, adCounty)
  const dayChannels = channels.filter(isDayChannel)
  const daysFor = (c: DayChannel) => daysIn(c, days, defaultDays(meta))
  const perDay = channels.reduce((s, k) => s + channelRate(rates, k, where), 0)
  const lines: QuoteLine[] = dayChannels.map((c) => ({
    channel: c, label: BOOST_CHANNELS.find((x) => x.key === c)?.name || c, per_day: baseRates(meta)[c],
    counties: Math.max(1, where.length), days: daysFor(c),
    per_day_total: baseRates(meta)[c] * Math.max(1, where.length),
    total: baseRates(meta)[c] * Math.max(1, where.length) * daysFor(c),
  }))
  const daysTotal = lines.reduce((t, l) => t + l.total, 0)
  // a video over 45 s is fined on every ad-site boost (app/services.py video_fine)
  const videoFineDue = onAdsite ? videoAd?.video?.fine || 0 : 0
  const local: BoostQuote = {
    per_day: perDay, days_total: daysTotal, views: paidViews, view_blocks: blocks, views_total: viewsTotal,
    amount: daysTotal + viewsTotal + videoFineDue, days: Object.fromEntries(lines.map((l) => [l.channel, l.days])),
    counties: where, channel_lines: lines, video_fine: videoFineDue,
  }
  const q = quote && quote.views === paidViews ? quote : local

  useEffect(() => {
    if (!channels.length) {
      setQuote(null)
      return
    }
    setQuoting(true)
    const t = setTimeout(() => {
      api.get<BoostQuote>('/boost/quote', { channels: channels.join(','), counties: picked.join(','), county: adCounty,
                                            shop_days: daysFor('shop'), carousel_days: daysFor('carousel'), views: paidViews, item: item.id })
        .then(setQuote)
        .catch(() => setQuote(null))
        .finally(() => setQuoting(false))
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, days, picked, paidViews, adCounty])

  // Slots left in those counties today. A full county cannot be bought at all, so the API is asked again whenever
  // the counties or the channels change — and this ad's own running boost is left out of the count.
  const countiesKey = where.join(',')
  useEffect(() => {
    if (!countiesKey || !dayChannels.length) { setSlotsLeft([]); return }
    let alive = true
    api.get<{ counties: Availability[] }>('/boost/availability', { counties: countiesKey, item: item.id })
      .then((r) => alive && setSlotsLeft(r.counties || [])).catch(() => alive && setSlotsLeft([]))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countiesKey, channels.join(','), item.id])
  const fullCounties = fullIn(slotsLeft, dayChannels)

  const toggleCounty = (c: string) => setPicked((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))
  const needsPhone = pay.method === 'mpesa'
  const countyMatches = (() => {
    const s = countyQuery.trim().toLowerCase()
    const pool = counties.filter((c) => !picked.includes(c) && (!s || c.toLowerCase().includes(s)))
    return pool.slice(0, s ? 30 : 12)
  })()

  const confirm = async () => {
    setErr('')
    if (!channels.length) return setErr('Pick at least one channel')
    if (dayChannels.some((c) => daysFor(c) < meta.min_days)) return setErr(`Minimum ${meta.min_days} day`)
    if (onAdsite && paidViews < viewRules(meta).min) return setErr(`The ad site boost starts at ${viewRules(meta).min.toLocaleString()} views`)
    if (fullCounties.length) return setErr(`${fullCounties[0].county} has no ${BOOST_CHANNELS.find((c) => c.key === fullCounties[0].channel)?.name} slot left today — drop that channel or pick another county`)
    if (needsPhone && !phone.trim()) return setErr('Enter the phone number to pay from')
    if (!canPay(pay, wallets, q.amount)) return setErr(`Your ${WALLET_NAMES[pay.wallet_role].toLowerCase()} does not hold ${ksh(q.amount)} — pick M-PESA or another wallet`)
    setBusy(true)
    try {
      const r = await api.post<{ amount_ksh: number; breakdown: Record<string, any>; payment_ref: string; ends: string; simulated: boolean; status: string; paid_from?: string; payment: MpesaPayment }>(`/items/${item.id}/boost`, { channels, days: Object.fromEntries(dayChannels.map((c) => [c, daysFor(c)])), views: paidViews, counties: picked, method: pay.method, wallet_role: pay.wallet_role, phone: phone.trim(), socket_key: newSocketKey() })
      if (r.status === 'pending' && r.payment) {
        // real Daraja STK push: wait for the PIN (sockets callback → API verification) before the boost goes live
        setPending(r.payment)
        return
      }
      // paid from a wallet (or the simulated gateway): the money was already with UKO, so the boost is live now
      const paidWith = r.paid_from === 'wallet' ? ` from your ${WALLET_NAMES[pay.wallet_role].toLowerCase()}` : ''
      toast.success(onAdsite && !onDayChannel ? `Boost paid${paidWith} · ${ksh(r.amount_ksh)} · ${paidViews.toLocaleString()} ad site views` : `Boost paid${paidWith} · ${ksh(r.amount_ksh)} · runs until ${fmtDate(r.ends)}`)
      await onDone()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (pending) {
    return (
      <Modal title="Pay for the boost" onClose={onClose}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-md bg-surface p-3">
            <Thumb src={item.image} size={44} />
            <div className="flex min-w-0 flex-col"><span className="truncate text-[13px] font-semibold text-ink">{item.title}</span><span className="text-[11px] text-muted">{channels.join(' + ')} · {onAdsite ? `${paidViews.toLocaleString()} views` : dayChannels.map((c) => `${daysFor(c)}d ${c}`).join(' + ')} · {ksh(pending.amount_ksh)}</span></div>
          </div>
          <MpesaPending payment={pending} title={`Pay ${ksh(pending.amount_ksh)} by M-PESA`}
            onApproved={async (r) => { toast.success(`Boost paid${r.receipt ? ` · receipt ${r.receipt}` : ''} · your ad is boosted`); await onDone() }}
            onFailed={(m) => setErr(m)} onRetry={() => { setPending(null); setErr('') }} />
          {err && <span className="text-[12px] text-danger">{err}</span>}
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Boost ad" onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3 rounded-md bg-surface p-3">
          <Thumb src={item.image} size={44} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-ink">{item.title}</span>
            <span className="text-[11px] text-muted">{ksh(item.min_amount)} · {item.boost_label}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-ink-2">Channels · ad site per {viewRules(meta).block.toLocaleString()} views, shop channels per day</span>
          {BOOST_CHANNELS.map((c) => {
            const on = channels.includes(c.key)
            const locked = !!item.adsite_only && c.key !== 'adsite'   // an ad-site-only ad is never listed in UKOshop
            return (
              <div key={c.key} className={cx('flex items-center justify-between gap-3 rounded-md border px-3 py-2.5', locked ? 'border-border opacity-55' : on ? 'border-primary-300 bg-primary-050' : 'border-border')}>
                <div className="flex min-w-0 flex-col"><span className="text-[13px] font-bold text-ink">{meta.labels?.[c.key] || c.name}</span><span className="text-[11px] text-muted">{channelPrice(meta, c.key, c.rate)} · {locked ? 'not available on an ad site only ad' : c.desc}</span></div>
                <Toggle checked={on && !locked} disabled={locked} onChange={(v) => setChannels((cs) => (v ? [...cs, c.key] : cs.filter((x) => x !== c.key)))} />
              </div>
            )
          })}
        </div>

        {onAdsite && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-2">Ad site views · {ksh(viewRules(meta).per1000)} per {viewRules(meta).block.toLocaleString()}</span>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" inputMode="numeric" min={viewRules(meta).min} step={viewRules(meta).block} className="w-28" value={views}
                onChange={(e) => setViews(Math.max(viewRules(meta).min, Math.floor(Number(e.target.value) || viewRules(meta).min)))} />
              {BOOST_VIEWS.map((v) => <Chip key={v} size="sm" active={views === v} onClick={() => setViews(v)}>{v.toLocaleString()}</Chip>)}
            </div>
            <span className="text-[11px] text-muted">Charged for {paidViews.toLocaleString()} views · the ad stops on the ad site once they are delivered.</span>
          </div>
        )}

        {/* one run length per shop channel, each starting at its own default */}
        {dayChannels.map((c) => (
          <div key={c} className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-2">
              {BOOST_CHANNELS.find((x) => x.key === c)?.name} days
              <span className="font-normal text-muted"> · {ksh(baseRates(meta)[c])} per county per day · {defaultDays(meta)[c]} by default</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" inputMode="numeric" min={meta.min_days} max={365} className="w-24" value={daysFor(c)}
                onChange={(e) => setDays((d) => ({ ...d, [c]: Math.min(365, Math.max(meta.min_days, Math.floor(Number(e.target.value) || meta.min_days))) }))} />
              {BOOST_DAYS.map((d) => <Chip key={d} size="sm" active={daysFor(c) === d} onClick={() => setDays((x) => ({ ...x, [c]: d }))}>{d} day{d === 1 ? '' : 's'}</Chip>)}
            </div>
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-ink-2">Counties</span>
            <span className="text-[11px] text-muted">each county is charged, and gives the ad a slot of its own</span>
          </div>
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((c) => <Chip key={c} size="sm" tone="primary" active onRemove={() => toggleCounty(c)}>{c}</Chip>)}
            </div>
          )}
          <Input placeholder="Search counties…" leading={<MapPin size={14} />} value={countyQuery} onChange={(e) => setCountyQuery(e.target.value)} />
          {counties.length === 0 ? (
            <span className="text-[11px] text-muted">County list unavailable right now · the boost runs in the county the ad is in.</span>
          ) : (
            <div className="flex max-h-[104px] flex-wrap gap-1.5 overflow-y-auto">
              {countyMatches.map((c) => <Chip key={c} size="sm" onClick={() => toggleCounty(c)}>{c}</Chip>)}
              {countyMatches.length === 0 && <span className="text-[11px] text-muted">No counties match “{countyQuery}”</span>}
            </div>
          )}
          <span className="text-[11px] text-muted">{picked.length === 0
            ? `No county picked — the ad runs in ${adCounty || 'the county it is posted in'} only.`
            : `The ad runs in ${picked.length} count${picked.length === 1 ? 'y' : 'ies'}: ${where.join(', ')}.`}</span>
          {dayChannels.length > 0 && where.map((r) => (
            <span key={r} className="text-[11px] text-muted">
              {r}: {dayChannels.map((c) => {
                const seat = slotsLeft.find((a) => a.county === r)
                const total = slotsIn(r, c, slotTable(meta), BASE_SLOTS)
                const left = seat ? seat.left[c] : total
                return `${BOOST_CHANNELS.find((x) => x.key === c)?.name} ${left > 0 ? `${left} of ${total} slot${total === 1 ? '' : 's'} left` : 'full today'}`
              }).join(' · ')}
            </span>
          ))}
        </div>

        {onAdsite && videoAd?.has_video && (
          <Notice tone={videoAd.video?.fine ? 'danger' : 'info'} title={`UKOapp video ads: ${VIDEO_AD.max_seconds} s at most`}>
            Viewers must watch a video ad to its end before they can go on. Anything over {VIDEO_AD.max_seconds} s is fined {ksh(VIDEO_AD.fine_ksh)} per {VIDEO_AD.block_seconds} s over, on every ad-site boost.
            {videoAd.video ? ` Your video runs ${clock(videoAd.video.seconds)}${videoAd.video.fine ? ` — this boost adds ${ksh(videoAd.video.fine)}.` : ' — no fine.'}` : ' Its length is not known yet.'}
            {videoAd.views > 0 && videoAd.avg_watch_seconds != null ? ` So far ${videoAd.views.toLocaleString()} ad-site viewers spent ${videoAd.avg_watch_seconds} s on it on average.` : ''}
            {videoAd.fines_ksh > 0 ? ` Fines paid on this ad: ${ksh(videoAd.fines_ksh)}.` : ''}
          </Notice>
        )}

        <div className="flex flex-col gap-2">
          <PayWith amount={q.amount} wallets={wallets} value={pay} onChange={setPay} />
          {needsPhone && <Input label="M-PESA number" placeholder="07xx xxx xxx" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </div>

        <div className="flex flex-col gap-1.5 rounded-md bg-surface px-3.5 py-3">
          {q.views > 0 && <div className="flex items-center justify-between text-[11px] text-ink-2"><span>{q.view_blocks} × {viewRules(meta).block.toLocaleString()} ad site views × {ksh(viewRules(meta).per1000)}</span><span>{ksh(q.views_total)}</span></div>}
          {q.video_fine ? <div className="flex items-center justify-between text-[11px] font-semibold text-danger"><span>Video over {VIDEO_AD.max_seconds} s{videoAd?.video ? ` · ${clock(videoAd.video.seconds)} · ${videoAd.video.blocks} × ${ksh(VIDEO_AD.fine_ksh)}` : ''}</span><span>{ksh(q.video_fine)}</span></div> : null}
          {(q.channel_lines || []).map((l) => (
            <div key={l.channel} className="flex items-center justify-between text-[11px] text-ink-2">
              <span>{BOOST_CHANNELS.find((x) => x.key === l.channel)?.name} · {ksh(l.per_day)} × {l.counties} count{l.counties === 1 ? 'y' : 'ies'} × {l.days} day{l.days === 1 ? '' : 's'}</span>
              <span>{ksh(l.total)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
            <span className="text-xs font-semibold text-ink-2">Total{quoting ? ' · updating…' : ''}</span>
            <span className="font-head text-lg font-extrabold text-ink">{ksh(q.amount)}</span>
          </div>
        </div>
        {fullCounties.map(({ county, channel }) => (
          <Notice key={`${county}-${channel}`} tone="warning">
            {county} has no {BOOST_CHANNELS.find((c) => c.key === channel)?.name} slot left today — drop that channel, pick another county, or boost tomorrow.
          </Notice>
        ))}
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" variant="secondary" loading={busy} disabled={!channels.length || q.amount <= 0 || fullCounties.length > 0} onClick={confirm}>Pay {ksh(q.amount)} &amp; boost</Button>
        </div>
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="fade-up max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-lg bg-bg p-5 shadow-card sm:rounded-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink-2 hover:bg-surface"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Seller packages — pay-per-use messaging units
// GET /seller/packages · POST /seller/packages/quote · POST /seller/packages (wallet or M-PESA STK) · PUT /seller/packages/features
type Checkout = { bundle: MessagingBundle['key'] | 'custom'; name: string; units: ChannelUnits; amount: number; targeting?: Targeting }
type BuyResponse = { package: PackageT; quote: PackageQuote; payment: MpesaPayment & { status?: string; paid_from?: string; message?: string } }
/** UKOshop's own accounts every seller's social post is published on (names / configured come from the API). */
const SOCIAL_ROWS: { key: SocialProvider; label: string }[] = [
  { key: 'twitter', label: 'X' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
]
const PACKAGE_STATUS: Record<string, { pill: string; label: string }> = {
  active: { pill: 'live', label: 'Active' },
  pending: { pill: 'pending', label: 'Awaiting payment' },
  expired: { pill: 'paused', label: 'Expired' },
  cancelled: { pill: 'cancelled', label: 'Cancelled' },
}
const emptyUnits = (): Record<MessagingChannel, string> => ({ email: '', sms: '', whatsapp: '', push: '', twitter: '', facebook: '', instagram: '' })
const isLegacyPackage = (p: PackageT) => p.type === 'pro' || !p.features?.units || Object.keys(p.features.units).length === 0
const packageName = (p: PackageT, pricing?: MessagingPricing) =>
  p.type === 'pro' ? 'Pro seller' : p.type === 'custom' ? 'Custom' : pricing?.bundles.find((b) => b.key === p.type)?.name || p.type.replace(/^\w/, (c) => c.toUpperCase())

function PackagesSection({ user, onSaved, onGoMessaging }: { user: User; onSaved: () => Promise<void>; onGoMessaging: () => void }) {
  const toast = useToast()
  const [data, setData] = useState<PackagesData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [custom, setCustom] = useState(emptyUnits)
  const [quote, setQuote] = useState<PackageQuote | null>(null)
  const [quoteErr, setQuoteErr] = useState('')
  const [quoting, setQuoting] = useState(false)
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  // target marketing: the wards this package is aimed at, and the channel whose reach is on screen
  const [targetChannel, setTargetChannel] = useState<BulkChannel>('email')
  const [targeting, setTargeting] = useState<Targeting>(emptyTargeting)
  const { audience, loading: reaching, err: reachErr } = useAudience(targetChannel, targeting)
  const [whatsapp, setWhatsapp] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await api.get<PackagesData>('/seller/packages')
      setData(r)
      if (r.targeting && (r.targeting.wards?.length || r.targeting.county)) setTargeting({ ...emptyTargeting(), ...r.targeting })
      setWhatsapp(r.whatsapp || user.telephone || '')
      setLoadErr('')
    } catch (e: any) {
      setLoadErr(e.message || 'Could not load messaging packages')
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // live quote for the custom builder (debounced; stale answers are ignored)
  const customUnits: ChannelUnits = Object.fromEntries(
    Object.entries(custom).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))] as const).filter(([, n]) => n > 0),
  )
  const customKey = JSON.stringify(customUnits)
  useEffect(() => {
    if (customKey === '{}') {
      setQuote(null)
      setQuoteErr('')
      setQuoting(false)
      return
    }
    let live = true
    setQuoting(true)
    const t = setTimeout(() => {
      api.post<PackageQuote>('/seller/packages/quote', { units: customUnits })
        .then((q) => { if (live) { setQuote(q); setQuoteErr('') } })
        .catch((e) => { if (live) { setQuote(null); setQuoteErr(e.message) } })
        .finally(() => { if (live) setQuoting(false) })
    }, 300)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customKey])

  const saveWhatsapp = async () => {
    setBusy('whatsapp')
    try {
      await api.put<PackageT>('/seller/packages/features', { features: { whatsapp: whatsapp.trim() } })
      toast.success('WhatsApp number saved — the button shows on every ad')
      await load()
      await onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }
  const closeCheckout = () => {
    setCheckout(null)
    load()
  }
  const paid = async () => {
    setCheckout(null)
    setCustom(emptyUnits())
    await load()
    await onSaved()
  }

  if (loadErr && !data) {
    return <Notice tone="warning" icon={<Crown size={16} />} title="Messaging packages unavailable" action={<Button size="sm" variant="outline" onClick={load}>Retry</Button>}>{loadErr}</Notice>
  }
  if (!data) return <PageLoading />
  const { pricing, balances, accounts, social_policy: socialPolicy, current } = data
  const rates = [...pricing.channels].sort((a, b) => MSG_CHANNELS.findIndex((c) => c.key === a.channel) - MSG_CHANNELS.findIndex((c) => c.key === b.channel))
  const priceOf = (c: MessagingChannel) => pricing.channels.find((x) => x.channel === c)?.unit_price ?? 0
  const totalUnits = MSG_CHANNELS.reduce((n, c) => n + Number(balances[c.key] || 0), 0)
  const lineRows = (lines: PackageLine[]) => (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px] text-ink-2">
      {lines.map((l) => {
        const m = channelMeta(l.channel)
        return (
          <li key={l.channel} className="flex items-center gap-2">
            <m.Icon size={13} className="shrink-0 text-muted" />
            <span className="flex-1">{l.units.toLocaleString('en-KE')} {l.units === 1 ? m.unit : m.units}</span>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Your units"
        sub={`${totalUnits.toLocaleString('en-KE')} unit${totalUnits === 1 ? '' : 's'} left · units never expire, and new packages add to what you have`}
        action={<Button size="sm" variant="secondary" icon={<Send size={14} />} onClick={onGoMessaging}>Open messaging</Button>}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {MSG_CHANNELS.map((c) => {
            const n = Number(balances[c.key] || 0)
            return (
              <div key={c.key} className="flex flex-col gap-1 rounded-md bg-surface px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted"><c.Icon size={12} /> {c.short}</span>
                <span className={cx('font-head text-xl font-extrabold leading-tight', n > 0 ? 'text-ink' : 'text-muted')}>{n.toLocaleString('en-KE')}</span>
                <span className="text-[11px] text-ink-2">{n === 1 ? c.unit : c.units} left</span>
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel title="Messaging packages" sub="Pay once — by M-PESA or from your wallet — and use the units whenever you like · no subscription, no expiry">
          <div className="grid gap-3 md:grid-cols-3">
            {pricing.bundles.map((b) => (
              <div key={b.key} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="font-head text-base font-extrabold text-ink">{b.name}</span>
                  <span className="text-xs text-ink-2">{b.tagline}</span>
                </div>
                {lineRows(b.lines)}
                <div className="mt-auto flex flex-col gap-2.5 border-t border-border pt-3">
                  <span className="font-head text-[24px] font-extrabold leading-tight text-ink">{ksh(b.amount)}</span>
                  <Button full icon={<Crown size={15} />} onClick={() => setCheckout({ bundle: b.key, name: b.name, units: b.units, amount: b.amount, targeting })}>Buy {b.name}</Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Price per unit" sub="What each message or post costs from your units">
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {rates.map((r) => {
              const m = channelMeta(r.channel)
              return (
                <li key={r.channel} className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><m.Icon size={15} /></span>
                  <span className="flex min-w-0 flex-1 flex-col"><span className="text-[13px] font-semibold text-ink">{r.label}</span><span className="text-[11px] text-muted">per {r.unit}</span></span>
                  <span className="whitespace-nowrap text-[13px] font-bold text-ink">{kshCents(r.unit_price)}</span>
                </li>
              )
            })}
          </ul>
          <p className="m-0 mt-3 text-[11px] text-muted">
            E-mail and WhatsApp use 1 unit per recipient · SMS use 1 unit per recipient per SMS part (160 characters, fewer with emoji) · posts use 1 unit each · only messages that really go out use units{pricing.min_package ? ` · smallest package ${ksh(pricing.min_package)}` : ''}.
          </p>
        </Panel>
      </div>

      <Panel
        title="Target marketing"
        sub="Pick the wards you want to sell into and see how many UKO accounts are there — then buy that many messages"
      >
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-2">Channel</span>
              <div className="flex flex-wrap gap-1.5">
                {BULK_CHANNELS.map((c) => {
                  const m = channelMeta(c)
                  return (
                    <Chip key={c} active={targetChannel === c} onClick={() => setTargetChannel(c)}>
                      <span className="flex items-center gap-1.5"><m.Icon size={12} /> {m.short}</span>
                    </Chip>
                  )
                })}
              </div>
            </div>
            <WardTargeting channel={targetChannel} value={targeting} onChange={setTargeting} audience={audience} loading={reaching} />
            {reachErr && <Notice tone="danger">{reachErr}</Notice>}
          </div>
          <BulkQuantity
            channel={targetChannel}
            reach={audience?.reach ?? 0}
            sendable={audience?.sendable ?? 0}
            maxPerCampaign={audience?.max_per_campaign ?? 0}
            unitPrice={priceOf(targetChannel)}
            balance={Number(balances[targetChannel] || 0)}
            loading={reaching}
            onAdd={(n) => {
              setCustom((u) => ({ ...u, [targetChannel]: String(n) }))
              toast.success(`${n.toLocaleString('en-KE')} ${channelMeta(targetChannel).units} added — the price is in “Build your own package” below`)
            }}
          />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title="Build your own package" sub="Pick how many of each you need — the price updates as you type">
          <div className="flex flex-col gap-3.5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MSG_CHANNELS.map((c) => (
                <Input
                  key={c.key}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  label={`${c.units[0].toUpperCase()}${c.units.slice(1)}`}
                  placeholder="0"
                  leading={<c.Icon size={14} />}
                  hint={`${kshCents(priceOf(c.key))} each`}
                  value={custom[c.key]}
                  onChange={(e) => setCustom((u) => ({ ...u, [c.key]: e.target.value.replace(/[^\d]/g, '') }))}
                />
              ))}
            </div>
            {quoteErr && <Notice tone="danger">{quoteErr}</Notice>}
            <div className="flex flex-col gap-1.5 rounded-md bg-surface px-3.5 py-3">
              {quote ? (
                quote.lines.map((l) => {
                  const m = channelMeta(l.channel)
                  return (
                    <div key={l.channel} className="flex items-center justify-between gap-3 text-[11px] text-ink-2">
                      <span>{l.units.toLocaleString('en-KE')} {l.units === 1 ? m.unit : m.units} × {kshCents(l.unit_price)}</span>
                      <span>{kshCents(l.list_price)}</span>
                    </div>
                  )
                })
              ) : (
                <span className="text-[11px] text-muted">{quoting ? 'Pricing your package…' : 'Enter at least one quantity to see the price.'}</span>
              )}
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
                <span className="text-xs font-semibold text-ink-2">Total{quoting ? ' · updating…' : ''}</span>
                <span className="font-head text-lg font-extrabold text-ink">{quote ? ksh(quote.amount) : '—'}</span>
              </div>
              {quote && pricing.min_package > 0 && quote.amount <= pricing.min_package && <span className="text-[10px] text-muted">Packages start at {ksh(pricing.min_package)}.</span>}
            </div>
            <div>
              <Button icon={<Crown size={15} />} disabled={!quote || quoting} onClick={() => quote && setCheckout({ bundle: 'custom', name: 'Custom package', units: quote.units, amount: quote.amount, targeting })}>
                Buy custom package{quote && !quoting ? ` · ${ksh(quote.amount)}` : ''}
              </Button>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Where your posts go" sub="X, Facebook and Instagram posts are published on UKOshop's own accounts">
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {SOCIAL_ROWS.map((s) => {
                const a = accounts?.[s.key]
                const m = channelMeta(s.key)
                return (
                  <li key={s.key} className="flex items-center gap-2.5 py-3 first:pt-0 last:pb-0">
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', a?.configured ? 'bg-success-050 text-success' : 'bg-surface-2 text-ink-2')}><m.Icon size={16} /></span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-semibold text-ink">{s.label}</span>
                      <span className="truncate text-[11px] text-ink-2">{a?.name || 'UKOshop'}</span>
                    </span>
                    {a?.configured ? <Chip size="sm" tone="success">Live</Chip> : <Chip size="sm" tone="warning">Simulated — keys not set</Chip>}
                  </li>
                )
              })}
            </ul>
            <p className="m-0 mt-3 text-[11px] text-muted">Posts from every seller are published on UKOshop's accounts with your store name and ad link · each X, Facebook or Instagram post uses one unit.</p>
            {socialPolicy?.text && <Notice tone="warning" className="mt-3" title="Posting rules">{socialPolicy.text}</Notice>}
          </Panel>

          {current && current.status === 'active' && (
            <Panel title="WhatsApp button" sub="The number buyers reach from the WhatsApp button on your ads">
              <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveWhatsapp() }}>
                <Input label="WhatsApp number" placeholder="07xx xxx xxx" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                <div><Button type="submit" size="sm" loading={busy === 'whatsapp'} disabled={!whatsapp.trim()}>Save number</Button></div>
              </form>
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Package history" sub="Every messaging package you have bought · units are added when M-PESA confirms the payment" padded={false}>
        {data.history.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Crown size={26} />} title="No packages yet" sub="Packages you buy show up here with the units they added." /></div>
        ) : (
          <Table head={['Package', 'Units', 'Amount', 'Date', 'Status']}>
            {data.history.map((p) => {
              const st = PACKAGE_STATUS[p.status] || { pill: p.status, label: p.status.replace(/^\w/, (c) => c.toUpperCase()) }
              return (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap font-semibold text-ink">{packageName(p, pricing)}</Td>
                  <Td className="text-ink-2">{isLegacyPackage(p) ? `${p.annually ? 'Annual' : 'Monthly'} (legacy)` : unitsSummary(p.features.units)}</Td>
                  <Td className="whitespace-nowrap font-semibold">{ksh(p.amount)}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{fmtDate(p.since, false) || '—'}</Td>
                  <Td><StatusPill status={st.pill} label={st.label} /></Td>
                </tr>
              )
            })}
          </Table>
        )}
      </Panel>

      {checkout && (
        <BuyPackageDialog
          checkout={checkout}
          defaultPhone={user.profile.mpesa_number || user.telephone || ''}
          defaultWhatsapp={data.whatsapp || user.telephone || ''}
          askWhatsapp={!current || current.status !== 'active'}
          onClose={closeCheckout}
          onPaid={paid}
        />
      )}
    </div>
  )
}

/** How many messages to buy for the wards that are picked: the reach on the left, the quantity on the right.
 *  It opens on the whole reach — the usual answer — and "Add to package" drops the number into the custom builder
 *  below, where the existing quote prices it per message. Units already on the balance are taken off the suggestion
 *  so a seller who tops up does not pay twice for the same reach. */
function BulkQuantity({ channel, reach, sendable, maxPerCampaign, unitPrice, balance, loading, onAdd }: {
  channel: BulkChannel; reach: number; sendable: number; maxPerCampaign: number; unitPrice: number; balance: number; loading: boolean
  onAdd: (units: number) => void
}) {
  const meta = channelMeta(channel)
  const [qty, setQty] = useState('')
  const suggested = Math.max(0, reach - balance)
  // an untouched field follows the wards the seller is picking
  useEffect(() => {
    setQty(suggested ? String(suggested) : '')
  }, [suggested])
  const n = Math.max(0, Math.floor(Number(qty) || 0))

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-head text-base font-extrabold text-ink">{loading ? '—' : reach.toLocaleString('en-KE')}</span>
        <span className="text-[11px] text-ink-2">people reachable on {meta.short} in the wards you picked</span>
      </div>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        label={`${meta.units[0].toUpperCase()}${meta.units.slice(1)} to buy`}
        placeholder="0"
        leading={<Target size={14} />}
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
        hint={balance > 0 ? `You already have ${balance.toLocaleString('en-KE')} ${meta.units} — this tops you up to the reach` : `${kshCents(unitPrice)} per ${meta.unit}`}
      />
      <div className="flex flex-col gap-1.5 rounded-md bg-surface px-3 py-2.5">
        <div className="flex items-center justify-between gap-3 text-[11px] text-ink-2">
          <span>{n.toLocaleString('en-KE')} × {kshCents(unitPrice)}</span>
          <span>{kshCents(n * unitPrice)}</span>
        </div>
        {n > reach && reach > 0 && <span className="text-[10px] text-warning">{(n - reach).toLocaleString('en-KE')} more than these wards hold — the extra units stay on your balance for later.</span>}
        {maxPerCampaign > 0 && sendable < reach && (
          <span className="text-[10px] text-muted">One {meta.short} campaign carries up to {maxPerCampaign.toLocaleString('en-KE')} — buy the lot and send it over a few campaigns.</span>
        )}
      </div>
      <Button size="sm" icon={<Plus size={14} />} disabled={!n} onClick={() => onAdd(n)}>Add to package</Button>
      <p className="m-0 text-[11px] text-muted">Messages are charged one unit each as they go out — nothing is spent on a message that never sends.</p>
    </div>
  )
}

function BuyPackageDialog({ checkout, defaultPhone, defaultWhatsapp, askWhatsapp, onClose, onPaid }: { checkout: Checkout; defaultPhone: string; defaultWhatsapp: string; askWhatsapp: boolean; onClose: () => void; onPaid: () => Promise<void> }) {
  const toast = useToast()
  const [phone, setPhone] = useState(defaultPhone)
  const [wa, setWa] = useState(defaultWhatsapp)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<MpesaPayment | null>(null)
  // Units are paid for by M-PESA or out of a wallet — a wallet purchase is approved by the API there and then.
  const [choice, setChoice] = useState<PayChoice>(PAY_BY_MPESA)
  const wallets = usePayableWallets()

  const pay = async () => {
    setErr('')
    if (choice.method === 'mpesa' && !phone.trim()) return setErr('Enter the M-PESA number to send the payment prompt to')
    if (!canPay(choice, wallets, checkout.amount)) return setErr(`Your ${WALLET_NAMES[choice.wallet_role].toLowerCase()} does not hold ${ksh(checkout.amount)} — pick M-PESA or another wallet`)
    setBusy(true)
    try {
      const r = await api.post<BuyResponse>('/seller/packages', {
        bundle: checkout.bundle, units: checkout.bundle === 'custom' ? checkout.units : undefined,
        method: choice.method, wallet_role: choice.wallet_role, phone: phone.trim(), whatsapp: askWhatsapp ? wa.trim() : '',
        targeting: checkout.targeting, socket_key: newSocketKey(),
      })
      if (r.payment?.status === 'approved') {   // paid from the wallet: the units are already on the balance
        toast.success(r.payment.message || `Paid from your ${WALLET_NAMES[choice.wallet_role].toLowerCase()} · your messaging units are ready`)
        await onPaid()
        return
      }
      setPending(r.payment)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const summary = (
    <div className="flex flex-col gap-1.5 rounded-md bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold text-ink">{checkout.name}</span>
        <span className="font-head text-base font-extrabold text-ink">{ksh(pending?.amount_ksh ?? checkout.amount)}</span>
      </div>
      <span className="text-[11px] text-ink-2">{unitsSummary(checkout.units)}</span>
      {checkout.targeting?.wards?.length ? (
        <span className="text-[11px] text-ink-2">Aimed at {checkout.targeting.wards.length === 1 ? checkout.targeting.wards[0] : `${checkout.targeting.wards.length} wards`}{checkout.targeting.county ? `, ${checkout.targeting.county}` : ''}</span>
      ) : null}
      <span className="text-[10px] text-muted">Units never expire · paid from a wallet they are added at once, by M-PESA when Safaricom confirms</span>
    </div>
  )

  if (pending) {
    return (
      <Modal title="Pay for your messaging units" onClose={onClose}>
        <div className="flex flex-col gap-3">
          {summary}
          <MpesaPending payment={pending} title={`Pay ${ksh(pending.amount_ksh)} by M-PESA`}
            onApproved={async (r) => { toast.success(`Payment received${r.receipt ? ` · receipt ${r.receipt}` : ''} · your messaging units are ready`); await onPaid() }}
            onFailed={(m) => setErr(m)} onRetry={() => { setPending(null); setErr('') }} />
          {err && <span className="text-[12px] text-danger">{err}</span>}
        </div>
      </Modal>
    )
  }
  return (
    <Modal title={`Buy ${checkout.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {summary}
        <PayWith amount={checkout.amount} wallets={wallets} value={choice} onChange={setChoice} />
        {choice.method === 'mpesa' && <Input label="M-PESA number" placeholder="07xx xxx xxx" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint="We send the payment prompt to this number" />}
        {askWhatsapp && <Input label="WhatsApp number for the ad button" placeholder="07xx xxx xxx" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} hint="Defaults to your account phone — you can change it later" />}
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={busy} onClick={pay}>Pay {ksh(checkout.amount)}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Shelves
function ShelvesList({ shelves, onReport }: { shelves: Shelve[] | null; onReport: (s: Shelve) => void }) {
  if (!shelves) return <PageLoading />
  if (shelves.length === 0) {
    return <EmptyState icon={<Store size={26} />} title="No shelves yet" sub="Pick a shelf in your ward when you post an ad — the owner verifies your item and holds it for buyers." action={<LinkButton to="/post-ad" size="sm">Post ad</LinkButton>} />
  }
  return (
    <div className="flex flex-col gap-2.5">
      {shelves.map((s) => (
        <div key={s.id} className="flex items-center gap-3 rounded-sm bg-surface p-3">
          <Thumb src={s.image} size={38}>{!s.image && <Store size={15} className="absolute text-border-strong" />}</Thumb>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Link to="/shelves/$id" params={{ id: String(s.id) }} className="truncate text-xs font-bold text-ink hover:text-primary">{s.name}</Link>
            <span className="truncate text-[10px] text-ink-2">{s.contact_phone} · Mon–Sat {s.opening_time}–{s.closing_time}{s.open_sunday ? ` · Sun ${s.sunday_hours || 'open'}` : ''}</span>
            <span className="truncate text-[10px] text-muted">Owner: {s.owner_name || '—'} · Licence {s.licence || 'pending'}</span>
          </div>
          <button type="button" onClick={() => onReport(s)} className="text-[11px] font-semibold text-danger hover:underline">Report</button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Profile & account
/** Store image — the picture buyers see next to the store name. Uploaded to the bucket by POST /api/upload, then
 *  saved on the account with PUT /auth/profile ({ avatar }); an empty avatar drops it back to the initials. */
function StoreImageCard({ user, onSaved }: { user: User; onSaved: () => Promise<unknown> }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const p = user.profile
  const storeName = p.store_name || user.name

  const save = async (avatar: string) => {
    await api.put<User>('/auth/profile', { avatar })
    await onSaved()
  }
  const pick = async (files: FileList | null) => {
    const file = files?.[0]
    if (input.current) input.current.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file')
    if (file.size > 25 * 1024 * 1024) return toast.error('That image is larger than 25 MB')
    setBusy('upload')
    try {
      const r = await api.upload(file, 'user')
      await save(r.url)
      toast.success('Store image updated')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }
  const remove = async () => {
    setBusy('remove')
    try {
      await save('')
      toast.success('Store image removed')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-3.5 rounded-md bg-surface p-3.5">
      <Avatar name={storeName} src={p.avatar || undefined} size={64} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-ink">Store image</span>
          <span className="text-[11px] text-muted">Shown with your store name on every ad · JPG or PNG, up to 25 MB</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" icon={<ImagePlus size={14} />} loading={busy === 'upload'} disabled={busy === 'remove'} onClick={() => input.current?.click()}>
            {p.avatar ? 'Change image' : 'Upload image'}
          </Button>
          {p.avatar && <Button type="button" size="sm" variant="ghost" loading={busy === 'remove'} disabled={busy === 'upload'} onClick={remove}>Remove</Button>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files)} />
    </div>
  )
}

function ProfilePanel({ user, onSaved, extra }: { user: User; onSaved: () => Promise<unknown>; extra?: ReactNode }) {
  const toast = useToast()
  const p = user.profile
  const [form, setForm] = useState({ first_name: p.first_name || '', last_name: p.last_name || '', location: p.location || '', birthday: p.birthday ? p.birthday.slice(0, 10) : '', gender: p.gender || '', store_name: p.store_name || '' })
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await api.put<User>('/auth/profile', { ...form, birthday: form.birthday || null })
      toast.success('Profile saved')
      await onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Profile & account">
      <div className="flex flex-col gap-4">
        <StoreImageCard user={user} onSaved={onSaved} />
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save() }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <Input label="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Location" placeholder="e.g. Kilimani, Nairobi" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <Input label="Birthday" type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Same two answers as the profile page (routes/profile.tsx) — one field, one list. */}
            <Select label="Gender" placeholder="Select" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
            <Input label="Store name" placeholder="Shown on your ads" value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
          </div>
          <Button type="submit" full loading={busy}>Save profile</Button>
        </form>
        <ChangeEmailCard user={user} onVerified={onSaved} />
        {extra}
      </div>
    </Panel>
  )
}

const RESEND_SECONDS = 45

function ChangeEmailCard({ user, onVerified }: { user: User; onVerified: () => Promise<unknown> }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [demoOtp, setDemoOtp] = useState('')
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [left, setLeft] = useState(0)
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!sentAt) return
    const tick = () => setLeft(Math.max(0, RESEND_SECONDS - Math.floor((Date.now() - sentAt) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [sentAt])

  const send = async () => {
    setErr('')
    if (!email.trim()) return setErr('Enter the new email address first')
    setBusy('send')
    try {
      const r = await api.post<{ sent: boolean; to: string; demo_otp: string }>('/auth/change-email/request', { new_email: email.trim() })
      setDemoOtp(r.demo_otp)
      setOtp('')
      setSentAt(Date.now())
      toast.success(`Code sent to ${r.to || user.telephone}`)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }
  const verify = async () => {
    setErr('')
    if (otp.length < 6) return setErr('Enter all 6 digits')
    setBusy('verify')
    try {
      await api.post('/auth/change-email/verify', { new_email: email.trim(), otp })
      toast.success('Email updated')
      setEmail('')
      setOtp('')
      setDemoOtp('')
      setSentAt(null)
      await onVerified()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }
  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface p-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold text-ink">Change email</span>
        <span className="text-[11px] text-muted">Current: {user.email}</span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input label="New email" type="email" placeholder="you@example.com" className="flex-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="button" variant="outline" size="md" loading={busy === 'send'} disabled={left > 0} onClick={send}>{sentAt ? 'Resend code' : 'Send code'}</Button>
      </div>
      {sentAt && (
        <>
          {demoOtp && <Notice tone="info">Demo OTP: <strong className="font-head">{demoOtp}</strong> — in production this is sent by SMS to {user.telephone}.</Notice>}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-ink-2">Enter the 6-digit code sent to your phone</span>
            <CodeDigits value={otp} length={6} onChange={setOtp} size="sm" />
          </div>
          <div className="flex items-center justify-between gap-3">
            {left > 0 ? <span className="text-[11px] text-muted">Resend code in {mmss}</span> : <button type="button" onClick={send} className="text-[11px] font-semibold text-primary hover:underline">Resend code</button>}
            <Button size="sm" loading={busy === 'verify'} disabled={otp.length < 6} onClick={verify}>Verify</Button>
          </div>
        </>
      )}
      {err && <Notice tone="danger">{err}</Notice>}
    </div>
  )
}

