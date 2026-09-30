/** 08 · Post Ad (desktop) + M7 · Post Ad (mobile). Also edits an existing ad via ?edit=<id>. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeftRight, Bike, CalendarClock, CarTaxiFront, Circle, CircleCheck, Crosshair, Hourglass, Info, LayoutGrid, Mail, MapPin, Megaphone, MessageSquare, Percent, Phone, Search, Share2, Smartphone, Sparkles, Trash2, Truck, User as UserIcon, X } from 'lucide-react'
import { api, type Category, type ItemCard, type ItemFull, type PickupQuote, type Shelve, type WalletRole } from '#/lib/api'
import { newSocketKey, waitForMpesaCallback } from '#/lib/sockets'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh, priceRange, timeAgo } from '#/lib/format'
import { BASE_DAYS, BASE_RATES, BASE_SLOTS, DAY_CHANNELS, VIDEO_AD, channelLines, clock, videoFine, countiesOf, daysIn, fullIn, isDayChannel, slotsIn, type Availability, type DayChannel, type QuoteLine, type Rates } from '#/lib/boost'
import { ProductCard } from '#/components/cards'
import { MediaUploader, RichEditor } from '#/components/media'
import { MapView, type MapPoint } from '#/components/map'
import { MpesaPending, type MpesaPayment } from '#/components/mpesa-pending'
import { PAY_BY_MPESA, PayWith, WALLET_NAMES, canPay, usePayableWallets, type PayChoice } from '#/components/pay-with'
import { Button, Card, Checkbox, Chip, CodeDigits, Input, LinkButton, Notice, PageLoading, ProgressBar, Radio, Select, Toggle, cx, Spinner } from '#/components/ui'

export const Route = createFileRoute('/post-ad')({
  validateSearch: (search: Record<string, unknown>): { edit?: number } => ({ edit: search.edit ? Number(search.edit) : undefined }),
  component: PostAdPage,
})

// ------------------------------------------------------------------ form model
type VariantRow = { id?: number; amount: string; color: string; size: string; type: string; stock: string }
type Form = {
  title: string; category_id: string; sub_category_id: string; catalogue_id: string; condition: string; gender: string
  brand: string; stock: string; weight_kg: string; sku: string
  description: string; features: string; specification: string
  variants: VariantRow[]; old_amount: string
  county: string; ward: string; shelve_id: string; add_to_shelve: boolean; handoff_method: 'self' | 'agent'
  /** handoff_method 'agent': where the rider collects and which vehicle — the fee is quoted by the API from these */
  pickup_lat: number | null; pickup_lng: number | null; pickup_address: string; pickup_vehicle: string
  images: string[]; videos: string[]
  adsite_only: boolean
  channels: string[]; boost_days: Partial<Rates>; views: number; boost_counties: string[]
  /** the one M-PESA prompt this ad is posted on: the trip to the shelve plus the boost, confirmed before Post ad */
  pay_method: PayMethod; pay_wallet: WalletRole; pay_phone: string; pay_confirmed: boolean
  barter_enabled: boolean; barter_accepts: string[]
}
type Cat = Category & { status?: string }
// What posting an ad is paid with: an M-PESA prompt, or one of the wallets this account already holds
// (seller earnings, shelf commission, delivery fees — #/components/pay-with). Airtel / card are phase 2.
type PayMethod = 'mpesa' | 'wallet' | 'airtel' | 'card'
/**
 * The two shop channels are bought by county and billed per county per day (see #/lib/boost): KSh 300 a day for
 * search, KSh 1,000 for the home carousel, the same in every county, and each runs for its own number of days
 * (2 and 5 to start with). The UKOapp ad site is priced per 1,000 views and has no county.
 */
type BoostRules = {
  min_days: number; per_1000_views: number; view_block: number; min_views: number
  default_days: Rates; county_slots: Record<string, Partial<Rates>>; default_slots: Rates
}
type Quote = {
  per_day: number; days_total: number; amount: number; days: Partial<Rates>
  views: number; view_blocks: number; views_total: number; per_1000_views: number; counties: string[]; channel_lines: QuoteLine[]
  /** the over-45 s fine on an ad-site video ad, already inside `amount` */
  video_fine?: number
}

/** What posting the ad costs, line by line — the API sends back the same bill it charged (services.ad_charges). */
type ChargeLine = { key: string; label: string; detail: string; amount: number }
type AdCharges = { lines: ChargeLine[]; pickup_fee: number; boost_amount: number; total: number }
/** POST /items · PUT /items/{id}: the ad, plus the one payment it owed. `boost_payment` is the same row, kept for older clients. */
type AdPosted = ItemFull & { charges?: AdCharges | null; ad_payment?: MpesaPayment | null; boost_payment?: MpesaPayment | null }

const DRAFT_KEY = 'uko_ad_draft'
const DEFAULT_RATES: Rates = BASE_RATES
const DEFAULT_RULES: BoostRules = {
  min_days: 1, per_1000_views: 500, view_block: 1000, min_views: 1000,
  default_days: BASE_DAYS, county_slots: {}, default_slots: BASE_SLOTS,
}
const DAY_CHIPS = [1, 2, 3, 5, 7, 14, 30]
const VIEW_CHIPS = [1000, 5000, 10000, 25000, 50000]
type ChannelKey = 'adsite' | 'shop' | 'carousel'
const BOOST_OPTIONS: { key: ChannelKey; name: string; desc: string; reach: string; shopOnly: boolean; Icon: typeof Megaphone }[] = [
  { key: 'adsite', name: 'UKOapp ad site', desc: 'Unlimited viewers, shown on the UKOapp ad site with a link back to this ad', reach: 'Paid per 1,000 views · views reported back from the ad site', shopOnly: false, Icon: Megaphone },
  { key: 'shop', name: 'UKOshop search & categories', desc: 'Pinned to the top of search and category results', reach: 'Shown to every shopper browsing your category in the counties you pick', shopOnly: true, Icon: Search },
  { key: 'carousel', name: 'Homepage carousel', desc: 'Slot in the home carousel', reach: 'Rotated on the UKOshop home page for shoppers in the counties you pick', shopOnly: true, Icon: LayoutGrid },
]
/** Where the ad runs. 'adsite' ads are billed per 1,000 views and never appear anywhere in UKOshop. */
const PLACEMENTS: { key: 'shop' | 'adsite'; name: string; desc: string; note: string; Icon: typeof Megaphone }[] = [
  { key: 'shop', name: 'UKOshop + UKOapp ad site', desc: 'Listed in UKOshop search, categories and the home page. Boost it onto the UKOapp ad site as well if you want.', note: 'Free to list · boosts optional', Icon: Search },
  { key: 'adsite', name: 'UKOapp ad site only', desc: 'The ad runs on the UKOapp ad site alone — it is never listed in UKOshop search, categories, the home page or shelves.', note: 'KSh 500 per 1,000 views on the ad site', Icon: Megaphone },
]
const isChannel = (c: string): c is ChannelKey => BOOST_OPTIONS.some((o) => o.key === c)
/** KSh 500 for 5 AI image prompts (settings.AI_PROMPT_PACK_PRICE). */
const PROMPT_PACK_KSH = 500
/** Shelf storage costs the seller nothing and simply runs out. Fallback only — the API sends the real number. */
const FREE_STORAGE_DAYS = 60
/** Vehicle → icon for the pick-up rate card (the keys come from the API, app/handoff.py). */
const VEHICLE_ICONS: Record<string, typeof Truck> = { bicycle: Bike, motorbike: Bike, tuktuk: CarTaxiFront, pickup: Truck, truck: Truck }
/** Views are bought in whole blocks of 1,000 (KSh 500 each), minimum one block. */
const blocksFor = (views: number, rules: BoostRules) => Math.max(1, Math.ceil(Math.max(Math.round(views) || 0, rules.min_views) / rules.view_block))
/** Same sum the API does (GET /boost/quote), run locally so the total moves the moment a county or a day changes. */
const localQuote = (channels: string[], days: Partial<Rates>, counties: string[], views: number, rates: Rates,
                    rules: BoostRules, adCounty: string, videoSeconds?: number): Quote => {
  const where = channels.some(isDayChannel) ? countiesOf(counties, adCounty) : []
  // Each channel is billed for its own days, in every county the boost lands in — one slot in each.
  const channel_lines = channelLines(channels, where, days, rates, rules.default_days,
                                     Object.fromEntries(BOOST_OPTIONS.map((o) => [o.key, o.name])))
  const per_day = channel_lines.reduce((s, l) => s + l.per_day_total, 0)
  const days_total = channel_lines.reduce((s, l) => s + l.total, 0)
  const view_blocks = channels.includes('adsite') ? blocksFor(views, rules) : 0
  const views_total = view_blocks * rules.per_1000_views
  const video_fine = channels.includes('adsite') ? videoFine(videoSeconds) : 0
  return {
    per_day, days_total, days: Object.fromEntries(channel_lines.map((l) => [l.channel, l.days])),
    views: view_blocks * rules.view_block, view_blocks, views_total, per_1000_views: rules.per_1000_views,
    counties: where, channel_lines, amount: days_total + views_total + video_fine, video_fine,
  }
}
const BARTER_OPTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'item', label: 'Item for item', desc: 'Swap this item for another item of similar value' },
  { key: 'item_cash', label: 'Item + cash', desc: 'Buyer offers an item and tops up with cash' },
  { key: 'item_service', label: 'Item + service', desc: 'Buyer offers an item plus a service' },
  { key: 'service', label: 'Service', desc: 'Buyer offers a service only' },
  { key: 'cash_service', label: 'Cash + service', desc: 'Buyer offers cash plus a service' },
]
const newRow = (): VariantRow => ({ amount: '', color: '', size: '', type: '', stock: '1' })
const EMPTY: Form = {
  title: '', category_id: '', sub_category_id: '', catalogue_id: '', condition: 'new', gender: 'unisex',
  brand: '', stock: '1', weight_kg: '', sku: '',
  description: '', features: '', specification: '',
  variants: [newRow()], old_amount: '',
  county: 'Nairobi', ward: '', shelve_id: '', add_to_shelve: false, handoff_method: 'self',
  pickup_lat: null, pickup_lng: null, pickup_address: '', pickup_vehicle: '',
  images: [], videos: [],
  adsite_only: false,
  channels: [], boost_days: {}, views: 1000, boost_counties: [],
  pay_method: 'mpesa', pay_wallet: 'seller', pay_phone: '', pay_confirmed: false,
  barter_enabled: false, barter_accepts: [],
}

function fromItem(i: ItemFull): Form {
  return {
    ...EMPTY,
    title: i.title, category_id: i.category_id ? String(i.category_id) : '', sub_category_id: i.sub_category_id ? String(i.sub_category_id) : '',
    catalogue_id: i.catalogue ? String(i.catalogue.id) : '', condition: i.condition || 'new', gender: i.gender || 'unisex',
    brand: i.brand || '', stock: String(i.stock ?? 1), weight_kg: i.weight_kg ? String(i.weight_kg) : '', sku: i.sku || '',
    description: i.description || '', features: i.features || '', specification: i.specification || '',
    variants: i.variants.length ? i.variants.map((v) => ({ id: v.id, amount: String(v.amount), color: v.color, size: v.size, type: v.type, stock: String(v.stock) })) : [newRow()],
    old_amount: i.old_amount ? String(i.old_amount) : '',
    county: i.county || 'Nairobi', ward: i.ward || '', shelve_id: i.shelve_id ? String(i.shelve_id) : '', add_to_shelve: !!i.shelve_id,
    handoff_method: i.handoff_method === 'agent' ? 'agent' : 'self',
    pickup_lat: i.pickup?.lat ?? null, pickup_lng: i.pickup?.lng ?? null,
    pickup_address: i.pickup?.address || '', pickup_vehicle: i.pickup?.vehicle || '',
    images: i.images || [], videos: i.videos || [],
    adsite_only: !!i.adsite_only,
    channels: i.boosted ? (i.boost_channels || []).filter(isChannel) : [], boost_days: {}, views: DEFAULT_RULES.min_views, boost_counties: i.boost_counties || [],
    barter_enabled: !!i.barter_enabled, barter_accepts: i.barter_accepts || [],
  }
}

function insertCat(tree: Cat[], c: Cat): Cat[] {
  if (!c.parent_id) return [...tree, { ...c, children: [] }]
  return tree.map((n) => (n.id === c.parent_id ? { ...n, children: [...n.children, { ...c, children: [] }] } : { ...n, children: insertCat(n.children as Cat[], c) }))
}

const num = (s: string) => (s === '' ? 0 : Number(String(s).replace(/[^\d.]/g, '')) || 0)
/** The two ends of the pick-up trip: the seller's pin and the shelf it is going to. */
function pickupPoints(lat: number | null, lng: number | null, shelve: { name: string; lat?: number | null; lng?: number | null } | undefined): MapPoint[] {
  const pts: MapPoint[] = []
  if (shelve) pts.push({ id: 'shelf', lat: shelve.lat, lng: shelve.lng, label: shelve.name, tone: 'success' })
  if (lat != null && lng != null) pts.push({ id: 'me', lat, lng, label: 'Collect here', tone: 'primary', draggable: true })
  return pts
}
const plain = (html: string) => html.replace(/<[^>]+>/g, '').trim()
/** 254712345678 or 0712345678 -> 0712 345 678 — the number the seller checks before agreeing to the charge. */
const prettyPhone = (s: string): string => {
  const d = s.replace(/\D/g, '')
  const local = d.startsWith('254') ? `0${d.slice(3)}` : d
  return local.length >= 9 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 10)}`.trim() : s.trim() || '—'
}

// ------------------------------------------------------------------ page
function PostAdPage() {
  const { user, ready } = useAuth()
  const { edit } = Route.useSearch()
  if (!ready) return <PageLoading />
  if (!user) {
    return (
      <div className="container-x py-10 md:py-16">
        <Card className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-050 text-primary"><UserIcon size={24} /></span>
          <h2 className="text-xl">Sign in to post an ad</h2>
          <p className="m-0 text-[13px] text-ink-2">Your ads, shelves and boosts live on your account. Sign in or create one in a minute.</p>
          <LinkButton to={'/signin' as any} search={{ next: '/post-ad' }} full>Sign in</LinkButton>
          <Link to={'/register' as any} className="text-[13px] font-semibold text-primary">Create an account</Link>
        </Card>
      </div>
    )
  }
  return <PostAdForm key={edit || 'new'} edit={edit} />
}

function PostAdForm({ edit }: { edit?: number }) {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState<Form>(EMPTY)
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [, tick] = useState(0)
  const loaded = useRef(false)
  const [loadingEdit, setLoadingEdit] = useState(!!edit)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'live' | 'draft' | null>(null)
  const [preview, setPreview] = useState(false)
  const [done, setDone] = useState<{ item: ItemFull; code: string; status: string; payment?: MpesaPayment | null; charges?: AdCharges | null } | null>(null)
  /** Editing: the ad as it was loaded — what it has already paid for, so nothing is charged for twice. */
  const [original, setOriginal] = useState<ItemFull | null>(null)

  // reference data
  const [cats, setCats] = useState<Cat[]>([])
  const [wards, setWards] = useState<{ wards: string[]; counties: string[] }>({ wards: [], counties: ['Nairobi'] })
  const [allShelves, setAllShelves] = useState<Shelve[]>([])
  const [wardShelves, setWardShelves] = useState<Shelve[]>([])
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES)
  const [rules, setRules] = useState<BoostRules>(DEFAULT_RULES)
  const [quote, setQuote] = useState<Quote | null>(null)
  /** each uploaded video's length - the first one is what the UKOapp ad site plays, and may be fined past 45 s */
  const [videoSecs, setVideoSecs] = useState<Record<string, number>>({})
  const [slotsLeft, setSlotsLeft] = useState<Availability[]>([])
  // rider pick-up: the priced trip from the seller's pin to the chosen shelf
  const [pickup, setPickup] = useState<PickupQuote | null>(null)
  const [pickupErr, setPickupErr] = useState('')
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    api.get<Cat[]>('/categories').then(setCats).catch(() => {})
    api.get<{ wards: string[]; counties: string[] }>('/wards').then(setWards).catch(() => {})
    api.get<Shelve[]>('/shelves').then(setAllShelves).catch(() => {})
    api.get<{ rates?: Partial<Rates>; default_days?: Partial<Rates>; county_slots?: Record<string, Partial<Rates>>; default_slots?: Partial<Rates>; min_days?: number; per_1000_views?: number; view_block?: number; min_views?: number }>('/boost/rates').then((r) => {
      if (r.rates) setRates({ ...DEFAULT_RATES, ...r.rates })
      setRules({
        min_days: r.min_days ?? DEFAULT_RULES.min_days, per_1000_views: r.per_1000_views ?? DEFAULT_RULES.per_1000_views,
        view_block: r.view_block ?? DEFAULT_RULES.view_block, min_views: r.min_views ?? DEFAULT_RULES.min_views,
        default_days: { ...DEFAULT_RULES.default_days, ...(r.default_days || {}) },
        county_slots: r.county_slots ?? DEFAULT_RULES.county_slots,
        default_slots: { ...DEFAULT_RULES.default_slots, ...(r.default_slots || {}) },
      })
    }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!form.ward) { setWardShelves([]); return }
    api.get<Shelve[]>('/shelves', { ward: form.ward }).then(setWardShelves).catch(() => setWardShelves([]))
  }, [form.ward])

  // draft: load once, then autosave (debounced) — localStorage only inside effects
  useEffect(() => {
    if (edit) {
      api.get<ItemFull>(`/seller/items/${edit}`).then((i) => { setOriginal(i); setForm({ ...fromItem(i), pay_phone: user?.profile.mpesa_number || user?.telephone || '' }); loaded.current = true }).catch((e) => toast.error(e.message)).finally(() => setLoadingEdit(false))
      return
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (d?.form) {
          const { barter_via_shelve: _legacy, ...saved } = d.form as Partial<Form> & { barter_via_shelve?: boolean }
          // a restored draft confirms its payment afresh — the amount may well have moved since it was saved
          setForm({ ...EMPTY, ...saved, channels: (saved.channels || []).filter(isChannel), pay_confirmed: false,
                    pay_phone: saved.pay_phone || user?.profile.mpesa_number || user?.telephone || '' })
          setSavedAt(d.savedAt || null)
        }
      } else if (user?.telephone) {
        setForm((f) => ({ ...f, pay_phone: user.profile.mpesa_number || user.telephone }))
      }
    } catch {}
    loaded.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit])
  useEffect(() => {
    if (!loaded.current || edit) return
    const t = setTimeout(() => {
      try {
        const now = new Date().toISOString()
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, savedAt: now }))
        setSavedAt(now)
      } catch {}
    }, 800)
    return () => clearTimeout(t)
  }, [form, edit])
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000)
    return () => clearInterval(t)
  }, [])

  // derived
  const cat = cats.find((c) => String(c.id) === form.category_id)
  const subs = (cat?.children || []) as Cat[]
  const sub = subs.find((c) => String(c.id) === form.sub_category_id)
  const catalogues = (sub?.children || []) as Cat[]
  const amounts = form.variants.map((v) => num(v.amount)).filter((n) => n > 0)
  const minAmount = amounts.length ? Math.min(...amounts) : 0
  const maxAmount = amounts.length ? Math.max(...amounts) : 0
  const shelf = allShelves.find((s) => String(s.id) === form.shelve_id) || wardShelves.find((s) => String(s.id) === form.shelve_id)
  const boostViews = form.channels.includes('adsite') ? blocksFor(form.views, rules) * rules.view_block : 0
  const boostCounties = countiesOf(form.boost_counties, form.county)
  /** Days for one channel: what the seller typed, else that channel's default (search 2, carousel 5). */
  const daysFor = (c: DayChannel) => daysIn(c, form.boost_days, rules.default_days)
  const firstVideo = form.videos[0] || ''
  const firstVideoSecs = firstVideo ? videoSecs[firstVideo] : undefined
  const local = localQuote(form.channels, form.boost_days, form.boost_counties, form.views, rates, rules, form.county, firstVideoSecs)
  const boostQuote = quote && quote.views === boostViews ? quote : local
  const boostCost = form.channels.length ? boostQuote.amount : 0
  const channelsKey = form.channels.join(',')
  const countiesKey = boostCounties.join(',')
  const daysKey = DAY_CHANNELS.map((c) => `${c}:${daysFor(c)}`).join(',')
  useEffect(() => {
    if (!form.channels.length) { setQuote(null); return }
    const t = setTimeout(() => {
      api.get<Quote>('/boost/quote', { channels: channelsKey, counties: form.boost_counties.join(','), county: form.county,
                                       shop_days: daysFor('shop'), carousel_days: daysFor('carousel'), views: boostViews,
                                       ...(firstVideo ? { video: firstVideo } : {}) })
        .then(setQuote).catch(() => setQuote(null))
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelsKey, daysKey, countiesKey, boostViews, form.county, firstVideo])
  // How many slots those counties have left today. A county that is full cannot be bought at all, so ask again
  // whenever the counties or the channels change — and leave this ad's own running boost out of the count.
  useEffect(() => {
    if (!countiesKey || !form.channels.some(isDayChannel)) { setSlotsLeft([]); return }
    let alive = true
    api.get<{ counties: Availability[] }>('/boost/availability', { counties: countiesKey, ...(edit ? { item: edit } : {}) })
      .then((r) => alive && setSlotsLeft(r.counties || [])).catch(() => alive && setSlotsLeft([]))
    return () => { alive = false }
  }, [countiesKey, channelsKey, edit])
  /** Counties where a channel the seller switched on has no place left today — the boost cannot be bought there. */
  const fullCounties = fullIn(slotsLeft, form.channels)

  // ---------------------------------------------------------------- rider pick-up
  // Dropping the item at the shelf yourself is free. Asking for a rider is not: the API measures the trip from
  // the seller's pin to the shelf and prices every vehicle for it. Re-asked whenever the pin, the shelf or the
  // weight moves — the weight decides which vehicles can carry the item at all.
  const wantsPickup = form.add_to_shelve && form.handoff_method === 'agent'
  const hasPin = form.pickup_lat != null && form.pickup_lng != null
  const itemWeight = num(form.weight_kg)
  useEffect(() => {
    if (!wantsPickup || !form.shelve_id || !hasPin) { setPickup(null); setPickupErr(''); return }
    let alive = true
    const t = setTimeout(() => {
      api.get<PickupQuote>(`/shelves/${form.shelve_id}/pickup-quote`, { lat: form.pickup_lat!, lng: form.pickup_lng!, weight_kg: itemWeight })
        .then((q) => { if (!alive) return; setPickup(q); setPickupErr('') })
        .catch((e) => { if (!alive) return; setPickup(null); setPickupErr(e.message) })
    }, 300)
    return () => { alive = false; clearTimeout(t) }
  }, [wantsPickup, form.shelve_id, hasPin, form.pickup_lat, form.pickup_lng, itemWeight])
  /** The vehicle the seller picked, priced for this trip — undefined until both the pin and the choice exist. */
  const pickupVehicle = pickup?.vehicles.find((v) => v.key === form.pickup_vehicle)
  const pickupFee = pickupVehicle?.available ? pickupVehicle.fee : 0
  /** Free storage runs from the day the item is sent, so the seller can be told the exact day it ends. */
  const storageDays = pickup?.free_storage_days ?? FREE_STORAGE_DAYS
  const storageEnds = new Date(Date.now() + storageDays * 86400000)

  // ---------------------------------------------------------------- what this ad costs
  // Two things can be owed before an ad may be posted: the rider trip that takes the item to the shelve, and
  // the boost. They go on one M-PESA prompt. The API re-prices both from the item and charges that — this is
  // the same sum (app/services.py ad_charges), run here so the seller sees the figure before he agrees to it.
  /** The hand-off this ad was last charged for. Change any part of it and it is a different trip, billed again. */
  const handoffSig = [form.shelve_id, form.handoff_method, form.pickup_lat, form.pickup_lng, form.pickup_vehicle].join('|')
  const paidHandoff = !!original?.pickup?.paid
    && handoffSig === [String(original.shelve_id ?? ''), original.handoff_method, original.pickup?.lat ?? null, original.pickup?.lng ?? null, original.pickup?.vehicle ?? ''].join('|')
  /** An ad already running a boost keeps it — the toggles show that boost, they do not buy it a second time. */
  const boostRunning = !!(edit && original?.boosted)
  const pickupDue = wantsPickup && pickupVehicle?.available && !paidHandoff ? pickupFee : 0
  const boostDue = form.channels.length && !boostRunning ? boostCost : 0
  const payLines: ChargeLine[] = [
    ...(pickupDue ? [{ key: 'pickup', label: `Delivery to shelve · ${pickupVehicle?.name || 'rider'}`,
                       detail: `${pickup?.distance_km ?? 0} km to ${pickup?.shelve.name || shelf?.name || 'the shelve'}`
                               + (pickupVehicle ? ` · KSh ${pickupVehicle.base} + KSh ${pickupVehicle.per_km}/km` : ''),
                       amount: pickupDue }] : []),
    ...(boostDue ? (boostQuote.channel_lines || []).map((l) => ({
      key: `boost:${l.channel}`, label: `Boost · ${BOOST_OPTIONS.find((o) => o.key === l.channel)?.name || l.channel}`,
      detail: `KSh ${l.per_day.toLocaleString()} × ${l.counties} count${l.counties === 1 ? 'y' : 'ies'} × ${l.days} day${l.days === 1 ? '' : 's'}`,
      amount: l.total })) : []),
    ...(boostDue && boostQuote.views_total ? [{ key: 'boost:adsite', label: `Boost · ${BOOST_OPTIONS[0].name}`,
      detail: `${boostQuote.view_blocks} × ${rules.view_block.toLocaleString()} views × KSh ${rules.per_1000_views}`,
      amount: boostQuote.views_total }] : []),
    ...(boostDue && boostQuote.video_fine ? [{ key: 'boost:video_fine', label: `Video over ${VIDEO_AD.max_seconds} s`,
      detail: `${firstVideoSecs ? `${clock(firstVideoSecs)} video · ` : ''}KSh ${VIDEO_AD.fine_ksh} per ${VIDEO_AD.block_seconds} s over ${VIDEO_AD.max_seconds} s`,
      amount: boostQuote.video_fine }] : []),
  ]
  const payTotal = pickupDue + boostDue
  /** What the money is for, in the seller's words: 'delivery to shelve and boost', never 'boost and boost'. */
  const payFor = [...new Set(payLines.map((l) => l.label.replace(/ ·.*$/, '').toLowerCase()))].join(' and ')
  const payDigits = form.pay_phone.replace(/\D/g, '')
  const payPhone = prettyPhone(form.pay_phone)
  // The bill can come out of a wallet this account already holds instead of an M-PESA prompt: same money,
  // already with UKO, so the boost starts and the rider is sent the moment the ad is posted.
  const wallets = usePayableWallets()
  const payChoice: PayChoice = form.pay_method === 'wallet' ? { method: 'wallet', wallet_role: form.pay_wallet } : PAY_BY_MPESA
  const payFrom = form.pay_method === 'wallet' ? `from your ${WALLET_NAMES[form.pay_wallet].toLowerCase()}` : `on ${payPhone}`
  // The seller agrees to one amount on one number (or one wallet): anything that moves takes that agreement back.
  const paySig = `${payTotal}|${form.pay_method}|${form.pay_wallet}|${payDigits}`
  useEffect(() => { setForm((f) => (f.pay_confirmed ? { ...f, pay_confirmed: false } : f)) }, [paySig])

  /** Drop the pin where the seller is standing. The browser asks him first; nothing is sent until he agrees. */
  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setPickupErr('This browser cannot share a location — type the pick-up address instead'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setPickupErr(''); set({ pickup_lat: Number(pos.coords.latitude.toFixed(6)), pickup_lng: Number(pos.coords.longitude.toFixed(6)) }) },
      (err) => { setLocating(false); setPickupErr(err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site — allow it, or pick the shelf ward and deliver the item yourself' : 'Could not read your location — try again') },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }
  const step = !form.title || !form.category_id ? 1 : amounts.length && form.images.length ? 3 : 2

  const checks = useMemo(() => [
    { ok: form.title.trim().length >= 3 && form.title.length < 70, text: 'Title is clear and under 70 characters' },
    { ok: form.images.length >= 4, text: `${form.images.length} photos added (8 recommended)` },
    { ok: plain(form.description).length > 200, text: 'Description over 200 characters' },
    { ok: amounts.length > 0, text: 'At least one variant priced' },
    { ok: form.videos.length > 0, text: 'Video added — ads with video get 2× views' },
  ], [form, amounts.length])
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100)

  const previewItem: ItemCard = {
    id: 0, code: '', title: form.title || 'Your ad title appears here', image: form.images[0] || '', images: form.images, is_verified: false, on_shelve: form.add_to_shelve,
    shelve_name: shelf?.name || '', shelve_id: shelf?.id || null, ward: form.ward || 'Your ward', rating: 0, rating_count: 0,
    min_amount: minAmount, max_amount: maxAmount, old_amount: num(form.old_amount) || null, sold_count: 0, stock: num(form.stock), status: 'live',
    condition: form.condition, gender: form.gender, boosted: form.channels.length > 0, boost_channels: form.channels, adsite_only: form.adsite_only,
    category_id: cat?.id || null, sub_category_id: sub?.id || null, seller_id: user?.id || 0,
    barter_enabled: form.barter_enabled, barter_accepts: form.barter_enabled ? form.barter_accepts : [],
  }

  // taxonomy
  const [adding, setAdding] = useState<'category' | 'sub' | 'catalogue' | null>(null)
  const [newName, setNewName] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const addTaxonomy = async () => {
    if (!adding || newName.trim().length < 2) return
    const parent_id = adding === 'category' ? null : adding === 'sub' ? cat?.id : sub?.id
    if (adding !== 'category' && !parent_id) { toast.error(adding === 'sub' ? 'Pick a category first' : 'Pick a sub-category first'); return }
    setAddBusy(true)
    try {
      const c = await api.post<Cat>('/categories', { name: newName.trim(), parent_id })
      setCats((t) => insertCat(t, c))
      if (adding === 'category') set({ category_id: String(c.id), sub_category_id: '', catalogue_id: '' })
      else if (adding === 'sub') set({ sub_category_id: String(c.id), catalogue_id: '' })
      else set({ catalogue_id: String(c.id) })
      toast.success(`"${c.name}" added — it will be reviewed before it appears in the shop menu`)
      setAdding(null); setNewName('')
    } catch (e: any) { toast.error(e.message) } finally { setAddBusy(false) }
  }

  // variants
  const setRow = (i: number, patch: Partial<VariantRow>) => set({ variants: form.variants.map((v, n) => (n === i ? { ...v, ...patch } : v)) })

  // AI images
  const [prompt, setPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState<'gen' | 'buy' | null>(null)
  const [aiResults, setAiResults] = useState<string[]>([])
  const [promptsLeft, setPromptsLeft] = useState<number | null>(null)
  const prompts = promptsLeft ?? user?.profile.ai_prompts_remaining ?? 0
  const generate = async () => {
    if (prompt.trim().length < 5) { toast.error('Describe the image in at least a few words'); return }
    setAiBusy('gen')
    try {
      const r = await api.post<{ image: string; prompts_remaining: number }>('/ai/generate', { prompt: prompt.trim() })
      setAiResults((a) => [r.image, ...a])
      setPromptsLeft(r.prompts_remaining)
      if (form.images.length < 8) set({ images: [...form.images, r.image] })
      toast.success('Image generated and added to your photos')
    } catch (e: any) { toast.error(e.message) } finally { setAiBusy(null) }
  }
  // Buy 5 prompts (KSh 500), paid from a wallet (credited at once) or by an M-PESA STK push to the seller's
  // phone (credited when Daraja's webhook confirms).
  type BuyStage = 'idle' | 'phone' | 'pending' | 'done' | 'failed'
  const [buy, setBuy] = useState<{ stage: BuyStage; phone: string; pay: PayChoice; paymentId: number | null; message: string; secondsLeft: number; receipt?: string }>({ stage: 'idle', phone: '', pay: PAY_BY_MPESA, paymentId: null, message: '', secondsLeft: 120 })
  const buyPrompts = () => setBuy({ stage: 'phone', phone: user?.profile.mpesa_number || user?.telephone || '', pay: PAY_BY_MPESA, paymentId: null, message: '', secondsLeft: 120 })
  const sendPush = async () => {
    const byWallet = buy.pay.method === 'wallet'
    if (!byWallet && !buy.phone.trim()) { toast.alert('Enter the M-PESA number to send the payment prompt to'); return }
    if (!canPay(buy.pay, wallets, PROMPT_PACK_KSH)) { toast.alert(`Your ${WALLET_NAMES[buy.pay.wallet_role].toLowerCase()} does not hold ${ksh(PROMPT_PACK_KSH)}`); return }
    setAiBusy('buy')
    try {
      const socketKey = newSocketKey()
      const r = await api.post<{ payment_id: number; merchant_request_id: string; checkout_request_id: string; socket_key: string; status: string; message: string; simulated: boolean; expires_in: number; prompts_remaining?: number }>('/ai/buy-prompts', { method: buy.pay.method, wallet_role: buy.pay.wallet_role, phone: byWallet ? '' : buy.phone.trim(), socket_key: socketKey })
      if (r.status === 'approved' && byWallet) {   // paid from the wallet: the prompts are already there
        if (r.prompts_remaining != null) setPromptsLeft(r.prompts_remaining)
        setBuy((b) => ({ ...b, stage: 'done', paymentId: r.payment_id, message: r.message, secondsLeft: 0 }))
        toast.success(r.message || `5 prompts added · paid from your ${WALLET_NAMES[buy.pay.wallet_role].toLowerCase()}`)
        refresh()
        return
      }
      setBuy((b) => ({ ...b, stage: 'pending', paymentId: r.payment_id, message: r.message, secondsLeft: r.expires_in || 120 }))
      // live path: Daraja → sockets server room (MerchantRequestID$key, signed webhook) → browser → API validates (STK query) → approved
      if (r.merchant_request_id) {
        const w = waitForMpesaCallback(r.merchant_request_id, r.socket_key || socketKey, { checkoutRequestId: r.checkout_request_id, timeoutMs: 150000 })
        w.promise.then(async (cb) => {
          try {
            const c = await api.post<{ status: string; prompts_remaining: number | null; receipt: string; error?: string | null }>('/payments/mpesa/confirm', { payment_id: r.payment_id, stk_callback: cb })
            if (c.status === 'approved') {
              if (c.prompts_remaining != null) setPromptsLeft(c.prompts_remaining)
              setBuy((b) => ({ ...b, stage: 'done', secondsLeft: 0, receipt: c.receipt || '' }))
              toast.success(`Payment received · 5 prompts added${c.receipt ? ` · receipt ${c.receipt}` : ''}`)
              refresh()
            } else {
              setBuy((b) => ({ ...b, stage: 'failed', message: c.error || 'The M-PESA payment was cancelled or declined', secondsLeft: 0 }))
              toast.alert(c.error || 'M-PESA payment cancelled')
            }
          } catch (e: any) { toast.alert(e.message) }
        }).catch(() => { /* socket timed out — the status poll still covers it */ })
      }
      toast.success(r.simulated ? 'Simulated M-PESA push (no Daraja keys in .env)' : `M-PESA prompt sent to ${buy.phone.trim()} — enter your PIN`)
    } catch (e: any) { toast.error(e.message); setBuy((b) => ({ ...b, stage: 'phone' })) } finally { setAiBusy(null) }
  }
  useEffect(() => {
    if (buy.stage !== 'pending' || !buy.paymentId) return
    let stopped = false
    const started = Date.now()
    const tick = async () => {
      if (stopped) return
      const left = Math.max(0, 120 - Math.floor((Date.now() - started) / 1000))
      try {
        const r = await api.get<{ status: string; prompts_remaining: number; receipt?: string | { receipt?: string } | null; error?: string | null }>(`/ai/buy-prompts/${buy.paymentId}/status`)
        if (r.status === 'approved') {
          stopped = true
          setPromptsLeft(r.prompts_remaining)
          setBuy((b) => ({ ...b, stage: 'done', secondsLeft: 0, receipt: (typeof r.receipt === 'string' ? r.receipt : r.receipt?.receipt) || '' }))
          toast.success(`Payment received · 5 prompts added (${r.prompts_remaining} available)`)
          refresh()
          return
        }
        if (r.status === 'cancelled') {
          stopped = true
          setBuy((b) => ({ ...b, stage: 'failed', message: r.error || 'The M-PESA payment was cancelled or declined', secondsLeft: 0 }))
          toast.alert(r.error || 'M-PESA payment cancelled')
          return
        }
      } catch { /* keep polling */ }
      setBuy((b) => ({ ...b, secondsLeft: left }))
      if (left <= 0) {
        stopped = true
        setBuy((b) => ({ ...b, stage: 'failed', message: 'No confirmation from M-PESA within 2 minutes — if you paid, the prompts are added as soon as the receipt arrives.' }))
      }
    }
    const id = window.setInterval(tick, 3000)
    tick()
    return () => { stopped = true; window.clearInterval(id) }
  }, [buy.stage, buy.paymentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // boost helpers
  const [countyPick, setCountyPick] = useState(false)
  const [daysText, setDaysText] = useState<Partial<Record<DayChannel, string>>>({})
  const setDays = (channel: DayChannel, raw: string) => {
    setDaysText((t) => ({ ...t, [channel]: raw }))
    const n = Math.round(Number(raw))
    if (raw !== '' && Number.isFinite(n)) set({ boost_days: { ...form.boost_days, [channel]: n } })
  }
  /** On blur: hold the typed number to at least the minimum, and drop back to the channel default when cleared. */
  const commitDays = (channel: DayChannel) => {
    const typed = daysText[channel]
    const n = Math.round(Number(typed ?? daysFor(channel)))
    if (typed !== undefined && typed !== '' && (!Number.isFinite(n) || n < rules.min_days)) {
      toast.alert(`Minimum boost duration is ${rules.min_days} day${rules.min_days > 1 ? 's' : ''}`)
    }
    set({ boost_days: { ...form.boost_days, [channel]: Math.max(rules.min_days, Number.isFinite(n) && n ? n : rules.default_days[channel]) } })
    setDaysText((t) => ({ ...t, [channel]: undefined }))
  }
  // ad site views: bought in whole 1,000-view blocks at KSh 500 each
  const [viewsText, setViewsText] = useState<string | null>(null)
  const setViews = (raw: string) => {
    setViewsText(raw)
    const n = Math.round(Number(raw.replace(/[^\d]/g, '')))
    if (raw !== '' && Number.isFinite(n)) set({ views: n })
  }
  const commitViews = () => {
    const n = Math.round(Number(String(viewsText ?? form.views).replace(/[^\d]/g, '')))
    const rounded = blocksFor(Number.isFinite(n) ? n : rules.min_views, rules) * rules.view_block
    if (rounded !== n) toast.alert(`Ad site views are bought in blocks of ${rules.view_block.toLocaleString()} · rounded up to ${rounded.toLocaleString()} views`)
    set({ views: rounded })
    setViewsText(null)
  }
  /** Switching to 'ad site only' pins the boost to the ad site — the shop channels cannot run on an ad UKOshop never shows. */
  const setPlacement = (key: 'shop' | 'adsite') => {
    if (key === 'adsite') set({ adsite_only: true, channels: ['adsite'] })
    else set({ adsite_only: false })
  }

  // submit
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (form.title.trim().length < 3) e.title = 'Give your ad a title (3+ characters)'
    if (!form.category_id) e.category = 'Pick a category'
    if (!amounts.length) e.variants = 'Add at least one row with an amount'
    if (form.add_to_shelve && !form.shelve_id) e.shelve = 'Pick the shelve to send this item to'
    // Everything the shelf hand-off needs has to be settled before the ad can be posted: a rider cannot be
    // sent to a place we do not have, and cannot be priced without a vehicle that can carry the item.
    if (form.add_to_shelve && form.shelve_id && form.handoff_method === 'agent') {
      if (!hasPin) e.pickup_address = 'Share your pick-up location so the rider can be sent and the trip priced'
      else if (pickupErr) e.pickup_address = pickupErr
      else if (!pickup) e.pickup_address = 'Hold on — we are still measuring the trip to the shelf'
      else if (!form.pickup_vehicle) e.pickup_vehicle = 'Choose the vehicle that collects your item'
      else if (!pickupVehicle) e.pickup_vehicle = 'That vehicle is no longer offered for this trip — pick another one'
      else if (!pickupVehicle.available) e.pickup_vehicle = pickupVehicle.reason
    }
    if (form.adsite_only && !form.channels.includes('adsite')) e.boost = `An ad site only ad needs the ${BOOST_OPTIONS[0].name} boost — KSh ${rules.per_1000_views} per ${rules.view_block.toLocaleString()} views`
    else if (form.channels.length) {
      if ((form.channels.filter(isDayChannel) as DayChannel[]).some((c) => daysFor(c) < rules.min_days)) e.boost = `Minimum boost duration is ${rules.min_days} day${rules.min_days > 1 ? 's' : ''}`
      // a county only shows so many boosts a day — the API refuses a full one too, this just says so before paying
      else if (fullCounties.length) e.boost = `${fullCounties[0].county} has no ${BOOST_OPTIONS.find((o) => o.key === fullCounties[0].channel)?.name} slot left today — drop that channel or pick wards in another county`
      else if (form.channels.includes('adsite') && boostViews < rules.min_views) e.boost = `The ad site boost starts at ${rules.min_views.toLocaleString()} views`
    }
    // Nothing is posted before the money for it is settled: the number to charge, and the exact amount, agreed.
    if (payTotal > 0) {
      if (form.pay_method === 'wallet' && !canPay(payChoice, wallets, payTotal)) e.payment = `Your ${WALLET_NAMES[form.pay_wallet].toLowerCase()} does not hold ${ksh(payTotal)} — pay by M-PESA or pick another wallet`
      else if (form.pay_method === 'mpesa' && payDigits.length < 9) e.payment = `Enter the M-PESA number to charge ${ksh(payTotal)} to`
      else if (!form.pay_confirmed) e.payment = `Confirm the ${ksh(payTotal)} payment ${payFrom} before posting the ad`
    }
    return e
  }
  /**
   * What is still missing, checked on every keystroke rather than only when Post ad is pressed. The button
   * stays shut until this is empty: an ad with a shelf request but no pick-up pin, no vehicle or no priced
   * trip would reach the shelf as a half-finished job, and the API refuses it anyway.
   * Saving a draft is deliberately not blocked — a draft is meant to be unfinished.
   */
  const blocker = Object.values(validate())[0] || ''

  /** One socket key for the whole ad: the pick-up and the boost are paid on a single M-PESA prompt (a wallet
   * payment needs no socket at all — the API settles it as it posts the ad). */
  const toBody = (status: 'live' | 'draft', socketKey: string) => ({
    title: form.title.trim(), description: form.description, features: form.features, specification: form.specification,
    gender: form.gender, condition: form.condition,
    category_id: form.category_id ? Number(form.category_id) : null, sub_category_id: form.sub_category_id ? Number(form.sub_category_id) : null, catalogue_id: form.catalogue_id ? Number(form.catalogue_id) : null,
    brand: form.brand, sku: form.sku, weight_kg: num(form.weight_kg), county: form.county, ward: form.ward, stock: Math.max(0, Math.round(num(form.stock))),
    images: form.images, videos: form.videos,
    variants: form.variants.filter((v) => num(v.amount) > 0).map((v) => ({ id: v.id, amount: num(v.amount), color: v.color.trim(), size: v.size.trim(), type: v.type.trim(), stock: Math.max(0, Math.round(num(v.stock))) || 1 })),
    shelve_id: form.add_to_shelve && form.shelve_id ? Number(form.shelve_id) : null, add_to_shelve: form.add_to_shelve, handoff_method: form.handoff_method,
    // the API re-measures and re-prices the trip from these — the fee shown above is a preview, not the price
    pickup_lat: wantsPickup ? form.pickup_lat : null, pickup_lng: wantsPickup ? form.pickup_lng : null,
    pickup_address: wantsPickup ? form.pickup_address.trim() : '', pickup_vehicle: wantsPickup ? form.pickup_vehicle : '',
    adsite_only: form.adsite_only,
    status, boost: status === 'live' && form.channels.length
      ? { channels: form.channels, days: Object.fromEntries((form.channels.filter(isDayChannel) as DayChannel[]).map((c) => [c, daysFor(c)])),
          views: boostViews, counties: form.boost_counties, method: form.pay_method, wallet_role: form.pay_wallet,
          phone: form.pay_method === 'mpesa' ? form.pay_phone.trim() : '', socket_key: socketKey }
      : null,
    // The payment the seller confirmed on the way out. `total` is the figure he was shown: the API re-prices
    // the whole bill itself and refuses the post when the two no longer agree, rather than charging him.
    payment: status === 'live' && payTotal > 0
      ? { method: form.pay_method, wallet_role: form.pay_wallet, phone: form.pay_method === 'mpesa' ? form.pay_phone.trim() : '',
          socket_key: socketKey, total: payTotal }
      : null,
    barter_enabled: form.barter_enabled, barter_accepts: form.barter_enabled ? form.barter_accepts : [],
  })
  const submit = async (status: 'live' | 'draft') => {
    const e = status === 'live' ? validate() : form.title.trim().length < 3 ? { title: 'Give your ad a title (3+ characters)' } : {}
    setErrors(e)
    if (Object.keys(e).length) { (e.boost && Object.keys(e).length === 1 ? toast.alert : toast.error)(Object.values(e)[0]); return }
    setBusy(status)
    try {
      const body = toBody(status, newSocketKey())
      const item = edit ? await api.put<AdPosted>(`/items/${edit}`, body) : await api.post<AdPosted>('/items', body)
      const payment = item.ad_payment || item.boost_payment || null
      let code = (item as any).handoff_code || ''
      if (form.add_to_shelve && !code) {
        try {
          const r = await api.get<{ items: { id: number; handoff_code: string }[] }>('/seller/items', { status: 'all', page: 1, per_page: 50 })
          code = r.items.find((x) => x.id === item.id)?.handoff_code || ''
        } catch {}
      }
      try { localStorage.removeItem(DRAFT_KEY) } catch {}
      setDone({ item, code, status, charges: item.charges || null, payment: payment && payment.status === 'pending' ? payment : null })
      refresh()
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  if (loadingEdit) return <PageLoading />
  if (done) return <SuccessCard done={done} onNew={() => { setDone(null); setForm(EMPTY) }} />

  const stepLabel = `Step ${step} of 3 · ${step === 1 ? 'basics' : step === 2 ? 'item details' : 'ready to post'}${savedAt ? ` · draft saved ${timeAgo(savedAt)}` : edit ? ` · editing ad #${edit}` : ''}`

  return (
    <div className="bg-surface pb-24 md:pb-13">
      {/* M7 · progress strip */}
      <div className="flex items-center gap-3 border-b border-border bg-bg px-3.5 py-3 md:hidden">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] font-bold">Step {step} of 3 · {step === 1 ? 'basics' : step === 2 ? 'item details' : 'ready to post'}</span>
          <ProgressBar value={(step / 3) * 100} className="h-[5px]" />
        </div>
        <Chip tone="success" size="sm">{savedAt ? `Draft · ${timeAgo(savedAt)}` : 'Signed in'}</Chip>
      </div>

      <div className="container-x grid gap-7 py-5 md:py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ------------------------------------------------ form column */}
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div className="hidden items-center justify-between gap-3 md:flex">
            <div className="flex flex-col gap-1">
              <h1 className="text-[26px] leading-tight">{edit ? 'Edit ad' : 'Post an ad'}</h1>
              <p className="m-0 text-[13px] text-ink-2">{stepLabel}</p>
            </div>
            <Chip tone="success">Signed in · {user?.name}</Chip>
          </div>

          {/* Item basics */}
          <Section title="Item basics" sub="Ads with a clear title and the right category sell up to 3× faster">
            <Input label="Ad title" required placeholder="e.g. Chronograph leather watch, sapphire glass, 42mm" value={form.title} onChange={(e) => set({ title: e.target.value })} error={errors.title} hint={`${form.title.length} / 70`} maxLength={255} />
            <div className="grid gap-3 md:grid-cols-3">
              <Select label="Category" required placeholder="Choose a category" value={form.category_id} onChange={(e) => set({ category_id: e.target.value, sub_category_id: '', catalogue_id: '' })} error={errors.category}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === 'pending' ? ' (pending review)' : ''}</option>)}
              </Select>
              <Select label="Sub-category" placeholder={cat ? 'Choose a sub-category' : 'Pick a category first'} value={form.sub_category_id} onChange={(e) => set({ sub_category_id: e.target.value, catalogue_id: '' })} disabled={!cat}>
                {subs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === 'pending' ? ' (pending review)' : ''}</option>)}
              </Select>
              <Select label="Catalogue" placeholder={sub ? 'Choose a catalogue' : 'Pick a sub-category first'} value={form.catalogue_id} onChange={(e) => set({ catalogue_id: e.target.value })} disabled={!sub}>
                {catalogues.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === 'pending' ? ' (pending review)' : ''}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap md:gap-3">
                {([['category', '+ Add category'], ['sub', '+ Add sub-category'], ['catalogue', '+ Add catalogue']] as const).map(([k, l]) => (
                  <Button key={k} type="button" variant="outline" size="sm" className={cx('!px-2 md:!px-3.5', adding === k && '!border-primary !text-primary')} onClick={() => { setAdding(adding === k ? null : k); setNewName('') }}>{l}</Button>
                ))}
              </div>
              {adding && (
                <div className="flex flex-col gap-2 rounded-md border border-primary-300 bg-primary-050 p-3 sm:flex-row sm:items-end">
                  <Input className="flex-1" label={adding === 'category' ? 'New category name' : adding === 'sub' ? `New sub-category under ${cat?.name || '…'}` : `New catalogue under ${sub?.name || '…'}`} placeholder="e.g. Smart watches" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTaxonomy() } }} />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="!py-[13px]" loading={addBusy} onClick={addTaxonomy}>Add</Button>
                    <Button type="button" size="sm" variant="ghost" className="!py-[13px]" onClick={() => setAdding(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              <p className="m-0 text-[11px] text-muted">Pick from the list, or add a new one — new categories, sub-categories and catalogues are reviewed before they appear in the shop menu.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <Select label="Condition" value={form.condition} onChange={(e) => set({ condition: e.target.value })}>
                <option value="new">New</option>
                <option value="used">Used</option>
              </Select>
              <Select label="Gender" value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
                <option value="men">Men</option>
                <option value="women">Women</option>
                <option value="unisex">Unisex</option>
                <option value="kids">Kids</option>
              </Select>
              <Input label="Brand" placeholder="e.g. Seiko" value={form.brand} onChange={(e) => set({ brand: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <Input label="Quantity in stock" type="number" min={0} inputMode="numeric" value={form.stock} onChange={(e) => set({ stock: e.target.value })} />
              <Input label="Item weight (kg)" type="number" min={0} step="0.1" inputMode="decimal" placeholder="0.4" value={form.weight_kg} onChange={(e) => set({ weight_kg: e.target.value })} hint="Used to quote delivery" />
              <Input label="SKU / seller ref" placeholder="Optional" value={form.sku} onChange={(e) => set({ sku: e.target.value })} />
            </div>
          </Section>

          {/* Description */}
          <Section title="Description, features & specification" sub="Rich text — the same content shows on the item page tabs">
            <RichEditor label="Description" value={form.description} onChange={(v) => set({ description: v })} max={4000} placeholder="What is it, what condition is it in, what's included…" />
            <RichEditor label="Features" value={form.features} onChange={(v) => set({ features: v })} max={2000} hint="Short bullet points — buyers scan these." placeholder="• Japanese quartz movement&#10;• Luminous hands…" />
            <RichEditor label="Specification" value={form.specification} onChange={(v) => set({ specification: v })} max={2000} hint="Materials, dimensions, what's in the box." placeholder="Case: stainless steel · Glass: sapphire · Box: watch, gift box…" />
          </Section>

          {/* Price & variants */}
          <Section title="Price & variants" sub="Add a row for every combination you stock — buyers filter by these">
            <div className="flex flex-col gap-2">
              <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_72px_40px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted sm:grid">
                <span>Amount (KSh)</span><span>Colour</span><span>Size</span><span>Type</span><span>Qty</span><span />
              </div>
              {form.variants.map((v, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 rounded-md border border-border bg-surface p-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_72px_40px] sm:border-0 sm:bg-transparent sm:p-0">
                  <VInput placeholder="Amount" inputMode="decimal" value={v.amount} onChange={(x) => setRow(i, { amount: x })} error={!!errors.variants && !num(v.amount)} />
                  <VInput placeholder="Colour" value={v.color} onChange={(x) => setRow(i, { color: x })} />
                  <VInput placeholder="Size" value={v.size} onChange={(x) => setRow(i, { size: x })} />
                  <VInput placeholder="Type" value={v.type} onChange={(x) => setRow(i, { type: x })} />
                  <VInput placeholder="Qty" inputMode="numeric" value={v.stock} onChange={(x) => setRow(i, { stock: x })} />
                  <button type="button" aria-label="Remove row" disabled={form.variants.length === 1} onClick={() => set({ variants: form.variants.filter((_, n) => n !== i) })} className="flex h-[42px] items-center justify-center rounded-sm bg-danger-050 text-danger disabled:opacity-40"><Trash2 size={15} /></button>
                </div>
              ))}
              {errors.variants && <span className="text-xs text-danger">{errors.variants}</span>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => set({ variants: [...form.variants, newRow()] })}>+ Add row</Button>
                <span className="text-[13px] text-ink-2">Shown as <strong className="font-head text-ink">{amounts.length ? priceRange(minAmount, maxAmount) : '—'}</strong></span>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-border bg-surface px-3.5 py-3 md:max-w-lg">
              <span className="text-xs font-semibold text-ink-2">Amount sold before</span>
              {form.old_amount ? (
                <span className="text-[13px] text-ink">
                  <span className="font-head font-extrabold text-muted line-through">{ksh(num(form.old_amount))}</span>
                  <span className="ml-2 text-ink-2">→ now from {amounts.length ? ksh(minAmount) : '—'} · shown as a strike-through deal price on the ad</span>
                </span>
              ) : (
                <span className="text-[12px] text-ink-2">Recorded automatically: when you edit this ad and lower the amount, the previous amount is saved and shown struck through as the price it sold at before.</span>
              )}
            </div>
          </Section>

          {/* Barter trade */}
          <Section title="Barter trade" sub="Let buyers bid with an item, a service or cash instead of paying the full amount">
            <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface p-4">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-[13px] font-bold"><ArrowLeftRight size={15} className="text-primary" /> Accept barter trades on this item</span>
                <span className="text-xs text-ink-2">Buyers see a “Barter” chip on your ad and can send you a bid. You accept or decline each one.</span>
              </div>
              <Toggle checked={form.barter_enabled} onChange={(v) => set({ barter_enabled: v })} />
            </div>
            {form.barter_enabled && (
              <>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-ink-2">Trades you accept — check all of them or none</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {BARTER_OPTIONS.map((o) => {
                      const on = form.barter_accepts.includes(o.key)
                      return (
                        <div key={o.key} className={cx('flex flex-col gap-1 rounded-md border p-3 transition-colors', on ? 'border-primary bg-primary-050' : 'border-border bg-bg')}>
                          <Checkbox checked={on} onChange={(v) => set({ barter_accepts: v ? [...form.barter_accepts, o.key] : form.barter_accepts.filter((k) => k !== o.key) })} label={<span className="font-bold text-ink">{o.label}</span>} />
                          <span className="pl-7 text-[11px] text-ink-2">{o.desc}</span>
                        </div>
                      )
                    })}
                  </div>
                  {form.barter_accepts.length === 0 && <span className="text-[11px] text-muted">No trade type selected yet — buyers will see barter is on but cannot bid until you pick at least one.</span>}
                </div>
                <div className="flex items-start gap-2 rounded-sm bg-surface px-3 py-2.5 text-xs text-ink-2"><Info size={14} className="mt-0.5 shrink-0 text-primary" /> Buyers can trade directly with you or at a shelve (inspected by the shelve owner). If a buyer wants to trade via a shelve you must avail your item to that shelve for inspection. Shelve fee is paid by the buyer in KSh.</div>
              </>
            )}
          </Section>

          {/* Location & shelf */}
          <Section title="Location & shelf" sub="Buyers filter by ward — items on a shelf get the verified badge">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="County" value={form.county} onChange={(e) => set({ county: e.target.value })}>
                {(wards.counties.length ? wards.counties : ['Nairobi']).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Select label="Ward" placeholder="Choose your ward" value={form.ward} onChange={(e) => set({ ward: e.target.value, shelve_id: '' })}>
                {wards.wards.map((w) => <option key={w} value={w}>{w}</option>)}
              </Select>
              <Select label="Drop-off shelf" placeholder={form.ward ? (wardShelves.length ? 'Choose a shelf' : 'No shelf in this ward yet') : 'Pick a ward first'} value={form.shelve_id} onChange={(e) => set({ shelve_id: e.target.value, add_to_shelve: e.target.value ? true : form.add_to_shelve })} error={errors.shelve}>
                {wardShelves.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div className="flex items-start gap-2 rounded-sm bg-surface px-3 py-2.5 text-xs text-ink-2"><Info size={14} className="mt-0.5 shrink-0 text-primary" /> UKO keeps three shelves per ward — your ward decides which shelves you can send this item to.</div>
            <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-bold">Add this item to a shelve (optional)</span>
                  <span className="text-xs text-ink-2">Items on a shelve get the Verified badge, escrow cover and delivery. Without a shelve the ad still runs, but buyers deal with you directly.</span>
                </div>
                <Toggle checked={form.add_to_shelve} onChange={(v) => set({ add_to_shelve: v })} />
              </div>
              {form.add_to_shelve && (
                <>
                  <span className="text-xs font-semibold text-ink-2">Select from available shelves</span>
                  {allShelves.length === 0 ? <span className="text-xs text-muted">No shelves are live yet — your ad will run without one.</span> : (
                    <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                      {allShelves.map((s) => {
                        const on = String(s.id) === form.shelve_id
                        return (
                          <button key={s.id} type="button" onClick={() => set({ shelve_id: String(s.id), ward: form.ward || s.ward })} className={cx('flex flex-col gap-1.5 rounded-md border p-3 text-left transition-colors', on ? 'border-primary bg-primary-050' : 'border-border bg-bg hover:border-border-strong')}>
                            <span className="flex items-center gap-2"><Radio checked={on} /><span className="truncate text-[13px] font-bold">{s.name}</span></span>
                            <span className="text-xs text-ink-2">{s.ward} · — km · {s.slots_free ?? Math.max(0, s.capacity - (s.items_count || 0))} slots free</span>
                            <span className="text-xs font-semibold text-primary">Free storage</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {errors.shelve && <span className="text-xs text-danger">{errors.shelve}</span>}
                  {/* The seller pays no storage — but a shelve sale is where the 20% commission is taken, so say it here. */}
                  <Notice tone="info" icon={<Percent size={15} />} title="20% commission on every shelve sale">
                    Selling through a shelve costs you nothing up front. When the item sells, UKO takes 20% of the
                    item price and the remaining 80% is credited to your seller wallet on escrow release.
                    {minAmount > 0 && <> At {ksh(minAmount)} that is {ksh(Math.round(minAmount * 0.2))} commission and {ksh(Math.round(minAmount * 0.8))} to you.</>}
                    {' '}15 of those 20 points fund the shelve that stores, verifies and hands over your item; UKO keeps 5.
                    An ad without a shelve pays no commission — but it gets no Verified badge, escrow cover or delivery either.
                  </Notice>
                  <Notice tone="warning" icon={<Hourglass size={15} />}>Shelve requests stay pending until the shelve owner approves the transaction. Until then the item shows as “Pending verification” and cannot be bought.</Notice>
                  <div className="flex flex-col gap-3 rounded-md border border-border bg-bg p-3.5">
                    <span className="text-[13px] font-bold">How does the item get to the shelve?</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {([['self', UserIcon, 'I deliver it myself', 'Drop it at the shelve within 48 hours of posting', 'Free'],
                         ['agent', Truck, 'A UKO rider collects it', 'Picked up from your location and taken to the shelf', pickupFee ? ksh(pickupFee) : 'Priced by distance']] as const).map(([k, Icon, t, sub, price]) => (
                        <button key={k} type="button" onClick={() => set({ handoff_method: k })} className={cx('flex flex-col gap-1 rounded-md border p-3 text-left', form.handoff_method === k ? 'border-primary bg-primary-050' : 'border-border hover:border-border-strong')}>
                          <span className="flex items-center gap-2 text-[13px] font-bold"><Icon size={15} className="text-primary" /> {t}</span>
                          <span className="text-xs text-ink-2">{sub}</span>
                          <span className="text-xs font-semibold text-primary">{price}</span>
                        </button>
                      ))}
                    </div>
                    {/* Storage is free either way — it just runs out. Say when, so nobody is surprised by the sweep. */}
                    <Notice tone="success" icon={<CalendarClock size={15} />} title={`No storage fee · ${storageDays} days on the shelf`}>
                      UKO does not charge you to keep this item on a shelf. It may sit there for {storageDays} days
                      (about two months) from the day you send it — that is {fmtDate(storageEnds.toISOString(), false)} if you post today,
                      and we remind you a week before. After that the shelf stops holding it: the item loses the verified badge and comes
                      off the shelf, the ad stays up and buyers order it from you directly until you send it to a shelf again. You may also
                      take it back off the shelf yourself at any time — but not while a paid order for it is still waiting there.
                    </Notice>

                    {form.handoff_method === 'agent' && (
                      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[13px] font-bold">Where does the rider collect it?</span>
                          <Button type="button" size="sm" variant="outline" loading={locating} icon={<Crosshair size={14} />} onClick={useMyLocation}>
                            {hasPin ? 'Update my location' : 'Use my current location'}
                          </Button>
                        </div>
                        <Input label="Pick-up address" placeholder="Building, street or landmark the rider should look for"
                               value={form.pickup_address} onChange={(e) => set({ pickup_address: e.target.value })}
                               hint={hasPin ? `Pinned at ${form.pickup_lat!.toFixed(5)}, ${form.pickup_lng!.toFixed(5)}` : 'Tap the map, or share your location, to put a pin on it'}
                               error={errors.pickup_address} />
                        {/* The map comes before the price, because tapping it is how the seller sets the price. */}
                        {form.shelve_id && (
                          <MapView
                            points={pickupPoints(form.pickup_lat, form.pickup_lng, pickup?.shelve ?? shelf)}
                            line={hasPin}
                            pick
                            onPick={(lat, lng) => { setPickupErr(''); set({ pickup_lat: lat, pickup_lng: lng }) }}
                            height={220}
                            hint={pickup ? `${pickup.distance_km} km to ${pickup.shelve.name}` : undefined}
                          />
                        )}
                        {!form.shelve_id ? (
                          <Notice tone="info" icon={<Info size={15} />}>Pick the shelf above and we will measure the trip to it.</Notice>
                        ) : !hasPin ? (
                          <Notice tone="warning" icon={<MapPin size={15} />} title="Drop a pin to see the price">
                            The pick-up fee is the distance from you to {shelf?.name || 'the shelf'}, so we need to know where you are.
                            Tap your spot on the map above, or use the button.{pickupErr ? ` ${pickupErr}` : ''}
                          </Notice>
                        ) : pickupErr ? (
                          <Notice tone="danger" icon={<Info size={15} />}>{pickupErr}</Notice>
                        ) : !pickup ? (
                          <div className="flex items-center gap-2 text-xs text-ink-2"><Spinner className="h-4 w-4" /> Measuring the trip to {shelf?.name || 'the shelf'}…</div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="text-ink-2"><span className="font-bold text-ink">{pickup.distance_km} km</span> from your pin to {pickup.shelve.name}, {pickup.shelve.ward}</span>
                              <span className="text-ink-2">Item weight {itemWeight ? `${itemWeight} kg` : 'not set — all vehicles shown'}</span>
                            </div>
                            <span className="text-xs font-semibold text-ink-2">Choose the vehicle that collects it</span>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                              {pickup.vehicles.map((v) => {
                                const on = v.key === form.pickup_vehicle
                                const Icon = VEHICLE_ICONS[v.key] || Truck
                                return (
                                  <button key={v.key} type="button" disabled={!v.available}
                                          onClick={() => set({ pickup_vehicle: v.key })}
                                          className={cx('flex flex-col gap-1.5 rounded-md border p-3 text-left transition-colors',
                                            !v.available ? 'cursor-not-allowed border-border bg-surface-2 opacity-60'
                                            : on ? 'border-primary bg-primary-050' : 'border-border bg-bg hover:border-border-strong')}>
                                    <span className="flex items-center gap-2">
                                      <Radio checked={on} />
                                      <Icon size={15} className="shrink-0 text-primary" />
                                      <span className="truncate text-[13px] font-bold">{v.name}</span>
                                      {v.key === pickup.suggested && v.available && <Chip tone="success" size="sm">Cheapest that fits</Chip>}
                                    </span>
                                    <span className="text-xs text-ink-2">{v.available ? `${v.desc} · about ${v.eta_minutes} min` : v.reason}</span>
                                    <span className={cx('text-xs font-semibold', v.available ? 'text-primary' : 'text-muted')}>
                                      {ksh(v.fee)} <span className="font-normal text-muted">· KSh {v.base} + KSh {v.per_km}/km × {v.distance_km} km</span>
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                            {errors.pickup_vehicle && <span className="text-xs text-danger">{errors.pickup_vehicle}</span>}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                              <span className="text-[13px] font-bold">Pick-up fee</span>
                              <span className="font-head text-base font-extrabold text-secondary">{pickupVehicle?.available ? ksh(pickupFee) : '—'}</span>
                            </div>
                            <span className="text-[11px] text-muted">
                              {pickupVehicle?.available
                                ? `${pickupVehicle.name} · ${pickup.distance_km} km to ${pickup.shelve.name} · paid with the ad on the payment step below, before it is posted. Storage on the shelf stays free.`
                                : 'Pick a vehicle to see what the trip costs.'}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex flex-col gap-1">
                        <span className="text-[13px] font-bold">Your hand-off code</span>
                        <span className="text-xs text-muted">The shelve owner (or the agent) enters a matching code to confirm they received the item from you. The codes must match before the item goes live. Your 4-digit code is generated when you post the ad.</span>
                      </div>
                      <CodeDigits value="" length={4} size="sm" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </Section>

          {/* Photos & video */}
          <Section title="Photos & video" sub="First photo is the cover. Clear, well-lit photos on a plain background sell best.">
            <MediaUploader images={form.images} videos={form.videos} onChange={(images, videos) => set({ images, videos })} max={8}
                           videoAd onVideoSeconds={(src, s) => setVideoSecs((v) => (v[src] === s ? v : { ...v, [src]: s }))} />
            <div className="flex flex-col gap-3 rounded-md border border-primary/15 bg-primary-050 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg text-primary-600"><Sparkles size={17} /></span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-bold">No photo yet? Generate one from a prompt</span>
                  <span className="text-xs text-ink-2">Paid add-on · KSh 500 for 5 prompts. Generated images must match the real item — the shelf attendant checks them at drop-off.</span>
                </div>
                <Chip size="sm" className="bg-bg text-primary-600">{prompts} prompts left</Chip>
              </div>
              <div className="flex flex-col gap-2 md:flex-row">
                <Input className="flex-1" placeholder="Black leather chronograph watch on a plain white background, studio lighting, front view" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                <div className="grid grid-cols-2 gap-2 md:flex">
                  <Button type="button" icon={<Sparkles size={15} />} loading={aiBusy === 'gen'} onClick={generate}>Generate</Button>
                  <Button type="button" variant="outline" loading={aiBusy === 'buy'} onClick={buyPrompts} className="whitespace-nowrap">Buy 5 prompts · KSh 500</Button>
                </div>
              </div>
              {buy.stage === 'phone' && (
                <div className="flex flex-col gap-2.5 rounded-md border border-primary-300 bg-primary-050 px-3.5 py-3">
                  <span className="text-[13px] font-semibold text-ink">Pay {ksh(PROMPT_PACK_KSH)} for 5 prompts</span>
                  <span className="text-[12px] text-ink-2">
                    {buy.pay.method === 'wallet'
                      ? 'The money is already with UKO, so the prompts are added the moment you press Pay — nothing is charged to your phone.'
                      : 'We send an M-PESA payment prompt (STK push) to this number. Enter your PIN on the phone; the prompts are added the moment Safaricom confirms the deposit.'}
                  </span>
                  <PayWith amount={PROMPT_PACK_KSH} wallets={wallets} value={buy.pay} onChange={(c) => setBuy((b) => ({ ...b, pay: c }))} />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    {buy.pay.method === 'mpesa' && <Input label="M-PESA number" placeholder="07xx xxx xxx" value={buy.phone} onChange={(e) => setBuy((b) => ({ ...b, phone: e.target.value }))} className="sm:max-w-xs" />}
                    <div className="flex gap-2">
                      <Button type="button" loading={aiBusy === 'buy'} onClick={sendPush}>{buy.pay.method === 'wallet' ? `Pay ${ksh(PROMPT_PACK_KSH)} from my wallet` : 'Send M-PESA prompt'}</Button>
                      <Button type="button" variant="ghost" onClick={() => setBuy((b) => ({ ...b, stage: 'idle' }))}>Cancel</Button>
                    </div>
                  </div>
                </div>
              )}
              {buy.stage === 'pending' && (
                <div className="flex items-start gap-3 rounded-md border border-primary-300 bg-primary-050 px-3.5 py-3">
                  <Spinner />
                  <div className="flex flex-col gap-0.5 text-[12px]">
                    <span className="text-[13px] font-semibold text-ink">Waiting for your M-PESA PIN…</span>
                    <span className="text-ink-2">{buy.message}</span>
                    <span className="text-muted">Prompt sent to {buy.phone} · expires in {String(Math.floor(buy.secondsLeft / 60)).padStart(2, '0')}:{String(buy.secondsLeft % 60).padStart(2, '0')}</span>
                  </div>
                </div>
              )}
              {buy.stage === 'done' && <Notice tone="success">{buy.message && buy.pay.method === 'wallet' ? buy.message : `Payment received${buy.receipt ? ` · receipt ${buy.receipt}` : ''} — 5 prompts added to your account.`}</Notice>}
              {buy.stage === 'failed' && <Notice tone="danger" action={<Button type="button" size="sm" variant="outline" onClick={buyPrompts}>Try again</Button>}>{buy.message}</Notice>}
              {aiResults.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {aiResults.map((src) => (
                    <div key={src} className="relative h-[72px] w-[92px] overflow-hidden rounded-sm border border-border bg-surface-2">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <Chip size="sm" tone="primary" className="absolute left-1 top-1 !px-1.5 !py-0.5 !text-[9px]">AI-assisted</Chip>
                      {!form.images.includes(src) && form.images.length < 8 && <button type="button" onClick={() => set({ images: [...form.images, src] })} className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[10px] font-semibold text-white">Use</button>}
                    </div>
                  ))}
                </div>
              )}
              <p className="m-0 text-[11px] text-muted">Generated images are watermarked as AI-assisted on the item page.{aiResults.length ? ` ${aiResults.length} prompt${aiResults.length > 1 ? 's' : ''} used on this ad.` : ''}</p>
            </div>
          </Section>

          {/* Where the ad runs */}
          <Section title="Where this ad appears" sub="List it in UKOshop, or run it on the UKOapp ad site only — paid per 1,000 views.">
            <div className="grid gap-3 md:grid-cols-2">
              {PLACEMENTS.map((pl) => {
                const on = (pl.key === 'adsite') === form.adsite_only
                return (
                  <button key={pl.key} type="button" onClick={() => setPlacement(pl.key)}
                    className={cx('flex flex-col gap-1.5 rounded-md border p-3.5 text-left transition-colors', on ? 'border-primary bg-primary-050' : 'border-border bg-bg hover:border-border-strong')}>
                    <span className="flex items-center gap-2">
                      <Radio checked={on} />
                      <span className="flex items-center gap-1.5 text-[13px] font-bold"><pl.Icon size={14} className="shrink-0 text-primary" />{pl.name}</span>
                    </span>
                    <span className="text-xs text-ink-2">{pl.desc}</span>
                    <span className="text-[11px] font-semibold text-secondary-600">{pl.note}</span>
                  </button>
                )
              })}
            </div>
            {form.adsite_only && (
              <Notice tone="warning" icon={<Megaphone size={15} />}>
                This ad will not be listed in UKOshop search, categories, the home page or shelf pages. It runs on the UKOapp ad site and is billed
                KSh {rules.per_1000_views} for every {rules.view_block.toLocaleString()} views — buy the views below. Viewers who tap it on the ad site are sent to this ad’s page.
              </Notice>
            )}
          </Section>

          {/* Boost */}
          <section className="grad-soft flex flex-col gap-4 rounded-lg border border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold">{form.adsite_only ? 'Buy ad site views' : 'Boost this ad'}</h3>
                <p className="m-0 text-xs text-ink-2">
                  {form.adsite_only
                    ? `Required for an ad site only ad · KSh ${rules.per_1000_views} for every ${rules.view_block.toLocaleString()} views on the UKOapp ad site.`
                    : `Optional · the UKOapp ad site is paid per ${rules.view_block.toLocaleString()} views; shop results and the home carousel are paid per day, at the rate of each county you target.`}
                </p>
              </div>
              <Chip size="sm" className="bg-bg text-ink-2">{form.channels.length ? `${form.channels.length} channel${form.channels.length > 1 ? 's' : ''} selected` : 'No boost selected'}</Chip>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {BOOST_OPTIONS.map((o) => {
                const on = form.channels.includes(o.key)
                const locked = form.adsite_only && o.shopOnly   // UKOshop channels cannot run on an ad UKOshop never lists
                return (
                  <div key={o.key} className={cx('flex flex-col gap-1.5 rounded-md border bg-bg p-3.5', locked ? 'border-border opacity-55' : on ? 'border-secondary' : 'border-border')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[13px] font-bold"><o.Icon size={14} className="shrink-0 text-secondary" />{o.name}</span>
                      <Toggle checked={on && !locked} disabled={locked} onChange={(v) => set({ channels: v ? [...form.channels, o.key] : form.channels.filter((c) => c !== o.key) })} />
                    </div>
                    <span className="text-xs font-semibold text-secondary-600">
                      {o.key === 'adsite'
                        ? `KSh ${rules.per_1000_views.toLocaleString()} per ${rules.view_block.toLocaleString()} views`
                        : `KSh ${rates[o.key as DayChannel].toLocaleString()} / county / day · ${rules.default_days[o.key as DayChannel]} days`}
                    </span>
                    <span className="text-xs text-ink-2">{o.desc}</span>
                    <span className="text-[11px] text-muted">{locked ? 'Not available on an ad site only ad' : o.reach}</span>
                    {o.key !== 'adsite' && boostCounties.map((r) => {
                      const seat = slotsLeft.find((a) => a.county === r)
                      const total = slotsIn(r, o.key as DayChannel, rules.county_slots, rules.default_slots)
                      const left = seat ? seat.left[o.key as DayChannel] : total
                      return (
                        <span key={r} className={cx('text-[11px]', left > 0 ? 'text-muted' : 'text-danger')}>
                          {r}: {left > 0 ? `${left} of ${total} slot${total === 1 ? '' : 's'} left today` : `full today · all ${total} slot${total === 1 ? '' : 's'} taken`}
                        </span>
                      )
                    })}
                  </div>
                )
              })}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {form.channels.includes('adsite') && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-ink-2">Ad site views <span className="font-normal text-muted">· KSh {rules.per_1000_views} per {rules.view_block.toLocaleString()} views · bought in blocks of {rules.view_block.toLocaleString()}</span></span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-[38px] w-[140px] items-center gap-1.5 rounded-md border border-border bg-bg px-3 text-[13px] focus-within:border-primary-300">
                      <input type="number" min={rules.min_views} step={rules.view_block} inputMode="numeric" aria-label="Views to buy on the UKOapp ad site" value={viewsText ?? String(form.views)} onChange={(e) => setViews(e.target.value)} onBlur={commitViews} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitViews() } }} className="w-full min-w-0 bg-transparent text-ink outline-none" />
                      <span className="text-xs text-muted">views</span>
                    </span>
                    {VIEW_CHIPS.map((v) => <Chip key={v} active={form.views === v && viewsText === null} onClick={() => { setViewsText(null); set({ views: v }) }} className={form.views !== v ? '!bg-bg' : ''}>{v.toLocaleString()}</Chip>)}
                  </div>
                  <span className="text-[11px] text-muted">{boostViews.toLocaleString()} views · {boostQuote.view_blocks} × KSh {rules.per_1000_views} = KSh {boostQuote.views_total.toLocaleString()} · the ad runs until the views are used up, and the ad site reports them back to your Seller page.</span>
                  {firstVideo && (
                    <span className={cx('rounded-md border px-3 py-2 text-[12px]', boostQuote.video_fine ? 'border-danger/30 bg-danger/5 font-semibold text-danger' : 'border-border text-ink-2')}>
                      {boostQuote.video_fine
                        ? `Video ads may run ${VIDEO_AD.max_seconds} s at most — viewers must watch to the end. Yours runs ${firstVideoSecs ? clock(firstVideoSecs) : 'longer'}, so this boost adds a KSh ${boostQuote.video_fine.toLocaleString()} fine (KSh ${VIDEO_AD.fine_ksh} per ${VIDEO_AD.block_seconds} s over).`
                        : `Video ads may run ${VIDEO_AD.max_seconds} s at most — viewers must watch to the end. Anything longer is fined KSh ${VIDEO_AD.fine_ksh} per ${VIDEO_AD.block_seconds} s over.${firstVideoSecs ? ` Yours runs ${clock(firstVideoSecs)}.` : ''}`}
                    </span>
                  )}
                </div>
              )}
              {/* one duration per shop channel: a search push is short, a carousel slot is booked for longer */}
              {(form.channels.filter(isDayChannel) as DayChannel[]).map((c) => (
                <div key={c} className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-ink-2">{BOOST_OPTIONS.find((o) => o.key === c)?.name} duration <span className="font-normal text-muted">· KSh {rates[c].toLocaleString()} per county per day · {rules.default_days[c]} days by default</span></span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-[38px] w-[118px] items-center gap-1.5 rounded-md border border-border bg-bg px-3 text-[13px] focus-within:border-primary-300">
                      <input type="number" min={rules.min_days} step={1} inputMode="numeric" aria-label={`${c} boost duration in days`} value={daysText[c] ?? String(daysFor(c))} onChange={(e) => setDays(c, e.target.value)} onBlur={() => commitDays(c)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDays(c) } }} className="w-full min-w-0 bg-transparent text-ink outline-none" />
                      <span className="text-xs text-muted">days</span>
                    </span>
                    {DAY_CHIPS.map((d) => <Chip key={d} active={daysFor(c) === d && daysText[c] === undefined} onClick={() => { setDaysText((t) => ({ ...t, [c]: undefined })); set({ boost_days: { ...form.boost_days, [c]: d } }) }} className={daysFor(c) !== d ? '!bg-bg' : ''}>{d} {d === 1 ? 'day' : 'days'}</Chip>)}
                  </div>
                  <span className="text-[11px] text-muted">{boostCounties.length || 1} count{(boostCounties.length || 1) === 1 ? 'y' : 'ies'} × KSh {rates[c].toLocaleString()} × {daysFor(c)} day{daysFor(c) === 1 ? '' : 's'} = KSh {(rates[c] * (boostCounties.length || 1) * daysFor(c)).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-ink-2">Counties <span className="font-normal text-muted">· the boost runs, and is charged, in each one</span></span>
                <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-2">
                  {form.boost_counties.map((c) => <Chip key={c} tone="primary" size="sm" onRemove={() => set({ boost_counties: form.boost_counties.filter((x) => x !== c) })}>{c}</Chip>)}
                  {countyPick ? (
                    <select autoFocus className="bg-transparent text-xs outline-none" value="" onChange={(e) => { if (e.target.value) set({ boost_counties: [...form.boost_counties, e.target.value] }); setCountyPick(false) }} onBlur={() => setCountyPick(false)}>
                      <option value="">Pick a county…</option>
                      {wards.counties.filter((c) => !form.boost_counties.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <button type="button" onClick={() => setCountyPick(true)} className="text-xs font-semibold text-primary">+ add county</button>
                  )}
                </div>
                <span className="text-[11px] text-muted">
                  {form.boost_counties.length === 0
                    ? `No county picked — the boost runs in ${form.county || 'the county the ad is in'} only`
                    : `${form.boost_counties.length} count${form.boost_counties.length === 1 ? 'y' : 'ies'} · each is charged, and gives the ad a slot of its own`}
                </span>
              </div>
            </div>

            {form.channels.length > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-bg/70 p-3.5 text-[12px] text-ink-2">
                <Smartphone size={14} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  {boostRunning
                    ? 'This ad is already boosted — what is switched on here is the boost it is running, and it is not charged for again.'
                    : `The boost is paid for with the ad itself: the amount, the M-PESA number and everything else this ad costs are on the payment step below, and the prompt is sent when you press ${edit ? 'Save changes' : 'Post ad'}.`}
                  {form.channels.includes('adsite') && ` Ad site views are paid up front — KSh ${rules.per_1000_views} buys ${rules.view_block.toLocaleString()} views and the ad stops when they run out.`}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-bold">{form.adsite_only ? 'Ad site total' : 'Boost total'}</span>
                <span className="font-head text-base font-extrabold text-secondary">{form.channels.length ? ksh(boostCost) : 'KSh 0'}</span>
              </div>
              {form.channels.length ? (
                <>
                  <span className="text-xs text-ink-2">
                    {form.channels.map((c) => BOOST_OPTIONS.find((o) => o.key === c)?.name).filter(Boolean).join(' + ')}
                    {boostQuote.views > 0 ? ` · ${boostQuote.views.toLocaleString()} ad site views` : ''}
                    {' · '}{boostCounties.length ? boostCounties.join(', ') : 'no county yet'} → {ksh(boostCost)}
                  </span>
                  {boostQuote.views > 0 && (
                    <span className="text-[11px] text-muted">
                      {boostQuote.view_blocks} × {rules.view_block.toLocaleString()} views × KSh {rules.per_1000_views} = KSh {boostQuote.views_total.toLocaleString()}
                    </span>
                  )}
                  {/* one line per channel: each is billed for its own days, in every county the boost runs in */}
                  {(boostQuote.channel_lines || []).map((l) => (
                    <span key={l.channel} className="text-[11px] text-muted">
                      {BOOST_OPTIONS.find((o) => o.key === l.channel)?.name}: KSh {l.per_day.toLocaleString()} × {l.counties} count{l.counties === 1 ? 'y' : 'ies'} × {l.days} day{l.days === 1 ? '' : 's'} = KSh {l.total.toLocaleString()}
                    </span>
                  ))}
                  {fullCounties.map(({ county, channel }) => (
                    <span key={`${county}-${channel}`} className="text-[11px] text-danger">
                      {county} has no {BOOST_OPTIONS.find((o) => o.key === channel)?.name} slot left today — drop that channel, pick wards in another county, or post the boost tomorrow.
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-xs text-ink-2">{form.adsite_only
                  ? `Switch on the ${BOOST_OPTIONS[0].name} above and buy views — an ad site only ad cannot post without them.`
                  : 'Switch on a channel above to boost — the ad posts without a boost otherwise.'}</span>
              )}
              {errors.boost && !errors.boost.includes('phone') && <span className="text-xs text-danger">{errors.boost}</span>}
            </div>
          </section>

          {/* Payment · the last thing before the ad goes: what it costs, the number it is charged to, and a yes */}
          <section className={cx('flex flex-col gap-4 rounded-lg border p-5', payTotal > 0 ? 'border-secondary/40 bg-bg' : 'border-border bg-bg')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold">Payment</h3>
                <p className="m-0 text-xs text-ink-2">
                  {payTotal > 0
                    ? 'One M-PESA prompt pays for everything this ad costs. Check the amount and the number, confirm them, and the prompt is sent the moment you post.'
                    : 'Nothing to pay for this ad. You take the item to the shelve yourself and no boost is switched on — and shelf storage is free.'}
                </p>
              </div>
              <Chip size="sm" tone={payTotal > 0 ? 'secondary' : 'success'}>{payTotal > 0 ? ksh(payTotal) : 'Free to post'}</Chip>
            </div>
            {payTotal > 0 ? (
              <>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {payLines.map((l) => (
                    <li key={l.key} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 text-[13px] last:border-0 last:pb-0">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-semibold">{l.label}</span>
                        <span className="text-[11px] text-muted">{l.detail}</span>
                      </span>
                      <span className="shrink-0 font-head font-extrabold">{ksh(l.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3.5 py-3">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-bold">Total to pay now</span>
                    <span className="text-[11px] text-muted">
                      {[pickupDue ? `delivery to shelve ${ksh(pickupDue)}` : '', boostDue ? `boost ${ksh(boostDue)}` : ''].filter(Boolean).join(' + ')} · charged once, before the ad is posted
                    </span>
                  </span>
                  <span className="font-head text-xl font-extrabold text-secondary">{ksh(payTotal)}</span>
                </div>
                <PayWith amount={payTotal} wallets={wallets} value={payChoice}
                         onChange={(c) => set({ pay_method: c.method, pay_wallet: c.wallet_role })} columns={2} />
                {form.pay_method === 'mpesa' && (
                  <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_1fr] md:items-start">
                    <Input label="M-PESA number" type="tel" inputMode="tel"
                           placeholder="07XX XXX XXX" value={form.pay_phone} onChange={(e) => set({ pay_phone: e.target.value })}
                           hint="The line that receives the PIN prompt" />
                    {/* the number, spelled out — the seller checks this, not the field he just typed in */}
                    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3.5">
                      <span className="text-[11px] uppercase tracking-wide text-muted">Prompt goes to</span>
                      <span className="flex items-center gap-2 font-head text-lg font-extrabold text-ink"><Smartphone size={16} className="text-primary" /> {payPhone}</span>
                      <span className="text-[11px] text-muted">{ksh(payTotal)} · enter your M-PESA PIN on that phone when it rings</span>
                    </div>
                  </div>
                )}
                <Checkbox checked={form.pay_confirmed} onChange={(v) => set({ pay_confirmed: v })}
                          label={<span className="text-[13px] text-ink">I confirm <b>{ksh(payTotal)}</b> may be {form.pay_method === 'wallet' ? <>taken from my <b>{WALLET_NAMES[form.pay_wallet].toLowerCase()}</b></> : <>charged to <b>{payPhone}</b></>} for {payFor}.</span>} />
                {errors.payment && <span className="text-xs font-semibold text-danger">{errors.payment}</span>}
                <span className="text-[11px] text-muted">
                  {form.pay_method === 'wallet'
                    ? 'The money is already with UKO, so nothing is charged to your phone and there is no fee for paying this way — the boost starts and the rider is sent as soon as the ad is posted.'
                    : 'Nothing leaves your account until you enter your PIN. The ad itself is saved either way — the boost only starts, and the rider is only sent, once Safaricom confirms the payment.'}
                </span>
              </>
            ) : (
              <Notice tone="success" icon={<CircleCheck size={15} />} title="Free to post">
                Listing an ad on UKOshop costs nothing. You pay only for a rider to take the item to the shelve, or for a boost — switch either on above and the bill appears here before anything is charged.
              </Notice>
            )}
          </section>

          {/* Submit bar */}
          <div className="hidden flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg p-4 md:flex">
            <span className={cx('text-xs', blocker ? 'font-semibold text-danger' : 'text-ink-2')}>
              {blocker || (payTotal > 0
                ? `${ksh(payTotal)} is charged to ${payPhone} the moment you post — the prompt arrives on that phone.`
                : 'Your ad is reviewed by the shelf attendant when you drop the item off.')}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" loading={busy === 'draft'} onClick={() => submit('draft')}>Save draft</Button>
              <Button type="button" variant="outline" onClick={() => setPreview(true)}>Preview</Button>
              <Button type="button" loading={busy === 'live'} disabled={!!blocker} title={blocker} onClick={() => submit('live')}>{edit ? 'Save changes' : 'Post ad'}</Button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ sidebar */}
        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-4">
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold">Live preview</h3>
              <Chip size="sm" tone="primary">Updates as you type</Chip>
            </div>
            <div className="pointer-events-none mx-auto w-full max-w-[240px]"><ProductCard item={previewItem} /></div>
            <p className="m-0 text-[11px] text-muted">{form.adsite_only
              ? 'This is how your ad appears on the UKOapp ad site. It is not listed in UKOshop search, categories or the home carousel.'
              : 'This is how your ad appears in search, category pages and the home carousel.'}</p>
          </Card>
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold">Ad quality</h3>
              <span className={cx('font-head text-lg font-extrabold', score >= 80 ? 'text-success' : score >= 40 ? 'text-warning' : 'text-danger')}>{score}%</span>
            </div>
            <ProgressBar value={score} tone={score >= 80 ? 'success' : score >= 40 ? 'warning' : 'danger'} />
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {checks.map((c) => (
                <li key={c.text} className="flex items-start gap-2 text-xs">
                  {c.ok ? <CircleCheck size={15} className="mt-px shrink-0 text-success" /> : <Circle size={15} className="mt-px shrink-0 text-border-strong" />}
                  <span className={c.ok ? 'text-ink' : 'text-ink-2'}>{c.text}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-[15px] font-bold">Seller packages</h3>
              <p className="m-0 text-xs text-ink-2">Reach buyers directly — pay per message, no subscription.</p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs text-ink-2">
              {[[Mail, 'E-mail your buyers and contacts'], [MessageSquare, 'SMS and WhatsApp messages'], [Phone, 'WhatsApp button on your ads'], [Share2, 'Post to your own Facebook, X and Instagram']].map(([Icon, t]: any) => (
                <li key={t} className="flex items-center gap-2"><Icon size={14} className="shrink-0 text-primary" /> {t}</li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-[13px] font-bold">Units never expire</span>
              <LinkButton to="/seller" search={{ tab: 'packages' }} size="sm">See packages</LinkButton>
            </div>
          </Card>
        </aside>
      </div>

      {/* M7 · sticky CTA */}
      <div className="fixed inset-x-0 bottom-[66px] z-30 flex flex-col gap-2 border-t border-border bg-bg px-3.5 py-3 md:hidden">
        {blocker
          ? <span className="text-[11px] font-semibold text-danger">{blocker}</span>
          : payTotal > 0 ? <span className="text-[11px] text-ink-2">{ksh(payTotal)} charged to {payPhone} when you post</span> : null}
        <div className="flex items-center gap-2.5">
          <Button type="button" variant="outline" onClick={() => setPreview(true)}>Preview</Button>
          <Button type="button" variant="outline" className="!px-3" loading={busy === 'draft'} onClick={() => submit('draft')}>Draft</Button>
          <Button type="button" full loading={busy === 'live'} disabled={!!blocker} onClick={() => submit('live')}>{edit ? 'Save changes' : 'Post ad'}</Button>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/60 p-0 md:items-center md:p-6" onClick={() => setPreview(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-bg p-5 md:rounded-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg">Preview</h3>
              <button type="button" onClick={() => setPreview(false)} aria-label="Close" className="rounded-full p-1 text-ink-2 hover:bg-surface"><X size={18} /></button>
            </div>
            <div className="grid gap-5 md:grid-cols-[232px_1fr]">
              <div className="pointer-events-none"><ProductCard item={previewItem} /></div>
              <div className="flex flex-col gap-3 text-[13px]">
                <div className="flex flex-wrap gap-1.5">
                  {cat && <Chip size="sm">{cat.name}</Chip>}{sub && <Chip size="sm">{sub.name}</Chip>}<Chip size="sm" tone="primary">{form.condition === 'new' ? 'New' : 'Used'}</Chip><Chip size="sm" tone="primary">{form.gender}</Chip>
                </div>
                <h4 className="text-base">Description</h4>
                {plain(form.description) ? <div className="prose-sm text-ink-2" dangerouslySetInnerHTML={{ __html: form.description }} /> : <p className="m-0 text-muted">No description yet.</p>}
                {plain(form.features) && (<><h4 className="text-base">Features</h4><div className="text-ink-2" dangerouslySetInnerHTML={{ __html: form.features }} /></>)}
                {plain(form.specification) && (<><h4 className="text-base">Specification</h4><div className="text-ink-2" dangerouslySetInnerHTML={{ __html: form.specification }} /></>)}
                <h4 className="text-base">Variants</h4>
                <ul className="m-0 list-disc pl-4 text-ink-2">{form.variants.filter((v) => num(v.amount) > 0).map((v, i) => <li key={i}>{ksh(num(v.amount))}{[v.color, v.size, v.type].filter(Boolean).length ? ` · ${[v.color, v.size, v.type].filter(Boolean).join(' · ')}` : ''}</li>)}</ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ pieces
function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 !p-4 md:!p-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-bold">{title}</h3>
        <p className="m-0 text-xs text-ink-2">{sub}</p>
      </div>
      {children}
    </Card>
  )
}

function VInput({ value, onChange, placeholder, inputMode, error }: { value: string; onChange: (v: string) => void; placeholder: string; inputMode?: 'decimal' | 'numeric'; error?: boolean }) {
  return <input value={value} inputMode={inputMode} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx('h-[42px] w-full min-w-0 rounded-sm border bg-bg px-3 text-[13px] text-ink outline-none placeholder:text-muted focus:border-primary-300', error ? 'border-danger' : 'border-border')} />
}

function SuccessCard({ done, onNew }: { done: { item: ItemFull; code: string; status: string; payment?: MpesaPayment | null; charges?: AdCharges | null }; onNew: () => void }) {
  const { item, code, status, payment, charges } = done
  const toast = useToast()
  const pending = item.status === 'pending' || item.shelve_status === 'pending'
  // A rider was booked: he comes to the seller, so "drop it off within 48 hours" would be the wrong instruction.
  const collected = item.handoff_method === 'agent' && !!item.pickup
  const shelfName = item.shelve?.name || 'the shelve'
  const pendingNote = collected
    ? `A ${item.pickup!.vehicle} rider collects “${item.title}” from ${item.pickup!.address || 'your pick-up location'} and takes it ${item.pickup!.distance_km} km to ${shelfName} · ${ksh(item.pickup!.fee)} ${item.pickup!.paid ? 'paid' : 'on the payment below'}. The shelve owner approves it and it goes live.`
    : `Drop “${item.title}” at ${shelfName} within 48 hours. The shelve owner approves it and it goes live.`
  // One M-PESA prompt paid for the trip to the shelve and the boost: the ad is posted either way, and both are
  // granted when Safaricom confirms the money. 'pending' is the seller's phone still asking for a PIN.
  const lines = charges?.lines || []
  const [payState, setPayState] = useState<'none' | 'pending' | 'paid' | 'failed'>(payment ? 'pending' : 'none')
  const [boostState, setBoostState] = useState<'none' | 'pending' | 'active' | 'failed'>(payment ? 'pending' : item.boosted ? 'active' : 'none')
  const [boostChannels, setBoostChannels] = useState<string[]>(item.boost_channels || [])
  return (
    <div className="container-x py-8 md:py-14">
      <Card className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-050 text-success"><CircleCheck size={30} /></span>
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl">{status === 'draft' ? 'Draft saved' : pending ? 'Ad posted · pending verification' : 'Your ad is live'}</h2>
          <p className="m-0 text-[13px] text-ink-2">{status === 'draft' ? 'Come back any time to finish and post it.' : pending ? pendingNote : item.adsite_only ? `“${item.title}” runs on the UKOapp ad site only — it is not listed in UKOshop. It stays up until the views you bought are used up.` : `“${item.title}” is now visible to buyers.`}</p>
        </div>
        {code && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-4">
            <span className="text-[13px] font-bold">Your hand-off code</span>
            <CodeDigits value={code} length={4} size="lg" />
            <span className="max-w-xs text-xs text-muted">Show this at drop-off — the shelve owner (or the agent) enters a matching code to confirm they received the item.</span>
          </div>
        )}
        {item.shelve_expires_at && (
          <span className="text-xs text-muted">
            No storage fee · {shelfName} keeps it free until {fmtDate(item.shelve_expires_at, false)}. After that it comes off the shelf and
            {' '}loses the verified badge: the ad stays up and buyers order it from you directly until you send it to a shelf again.
            {' '}While it sells off the shelf, UKO takes 20% of the item price and 80% goes to your seller wallet.
          </span>
        )}
        {boostState === 'active' && payState !== 'pending' && <Chip tone="secondary">Boosted · {boostChannels.join(' + ')}</Chip>}
        {payState === 'pending' && payment && (
          <div className="flex w-full flex-col gap-2 text-left">
            {/* what the prompt on the phone is asking for, so the amount on the screen is never a surprise */}
            {lines.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 rounded-md border border-border bg-surface p-3 text-[12px]">
                {lines.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-ink-2">{l.label}</span>
                    <span className="shrink-0 font-semibold">{ksh(l.amount)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 border-t border-border pt-1 font-bold">
                  <span>Total</span><span>{ksh(payment.amount_ksh)}</span>
                </li>
              </ul>
            )}
            <MpesaPending payment={payment} title={`Pay ${ksh(payment.amount_ksh)} to finish posting this ad`}
              onApproved={(r) => {
                setPayState('paid')
                const channels = r.boost?.channels || boostChannels
                setBoostChannels(channels)
                setBoostState(channels.length ? 'active' : 'none')
                toast.success(`Payment received${r.receipt ? ` · receipt ${r.receipt}` : ''}`)
              }}
              onFailed={(m) => { setPayState('failed'); setBoostState(boostState === 'pending' ? 'failed' : boostState); toast.alert(m) }} />
          </div>
        )}
        {payState === 'paid' && (
          <Chip tone="success">Paid{charges?.pickup_fee ? ' · rider booked' : ''}{charges?.boost_amount ? ' · boost running' : ''}</Chip>
        )}
        {item.adsite_only && <Chip tone="primary">UKOapp ad site only · not listed in UKOshop</Chip>}
        {payState === 'failed' && (
          <Notice tone="warning" title="The payment did not go through">
            {[charges?.pickup_fee ? `Nobody has been sent to collect “${item.title}” — take it to ${shelfName} yourself, or open the ad and pay for the rider again.` : '',
              charges?.boost_amount ? (item.adsite_only
                ? 'The ad site views were not paid either — the ad is not running yet. Pay for it any time from the seller items page.'
                : 'The boost was not paid either — the ad is live without it. Boost it any time from the seller items page.') : '',
            ].filter(Boolean).join(' ')}
          </Notice>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <LinkButton to="/items/$id" params={{ id: String(item.id) }}>View ad</LinkButton>
          <LinkButton to={'/seller' as any} variant="outline">Seller items page</LinkButton>
          <Button type="button" variant="ghost" onClick={onNew}>Post another</Button>
        </div>
      </Card>
    </div>
  )
}
