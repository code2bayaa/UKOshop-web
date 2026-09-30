/**
 * Tiny fetch wrapper for the FastAPI back-end.
 *  - adds the JWT (localStorage "uko_token") when present
 *  - adds a guest cart key (localStorage "uko_session") so carts work before sign-in
 *  - throws ApiError with the server's `detail` message
 */
export const API_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || 'http://localhost:8000'

/** Standalone shelves app: `/` = apply for a shelve, `/login`, `/dashboard` = shelf-owner console (moved out of the shop). */
export const SHELVES_URL: string = (
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SHELVES_URL) || 'http://localhost:3012'
).replace(/\/+$/, '')

/** Standalone delivery app: `/` = apply for delivery, `/login`, `/dashboard` = rider dashboard (moved out of the shop). */
export const DELIVERY_URL: string = (
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DELIVERY_URL) || 'http://localhost:3014'
).replace(/\/+$/, '')

/** Standalone courier app: `/` = apply to drive the long legs between shelves, `/login`, `/dashboard` = courier console. */
export const COURIER_URL: string = (
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_COURIER_URL) || 'http://localhost:3016'
).replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const isBrowser = typeof window !== 'undefined'

export function getToken(): string | null {
  if (!isBrowser) return null
  try {
    return localStorage.getItem('uko_token')
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  if (!isBrowser) return
  try {
    if (token) localStorage.setItem('uko_token', token)
    else localStorage.removeItem('uko_token')
  } catch {}
}

export function getSessionKey(): string {
  if (!isBrowser) return ''
  try {
    let k = localStorage.getItem('uko_session')
    if (!k) {
      k = 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem('uko_session', k)
    }
    return k
  } catch {
    return ''
  }
}

/** Which account folder an upload is stored under (shop/{role}/{id}/...); the API falls back to "user". */
export type UploadRole = 'shelve' | 'delivery' | 'user'

type Query = Record<string, string | number | boolean | undefined | null | Array<string | number>>

export function qs(params?: Query): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)))
    else sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/**
 * A FastAPI 422 body carries `detail` as a list of { loc, msg } rather than a sentence, and two things
 * make those unreadable as they arrive: pydantic puts "Value error, " in front of whatever our own
 * validator wrote, and `loc` is a path whose first element is always "body". So drop the prefix, turn
 * the rest of the path into words, and leave the field name off when the message already opens with it —
 * "Gender must be male or female" needs nothing in front of it, pydantic's own "Field required" does.
 */
const PYDANTIC_PREFIX = /^(?:Value error|Assertion failed),\s+/

function validationMessage(d: any): string {
  const msg = String(d?.msg || 'is not valid').replace(PYDANTIC_PREFIX, '')
  const path = (Array.isArray(d?.loc) ? d.loc : []).slice(1)
  // A position in a list is counted from 1, the way the person sees the rows on the page.
  const field = path.map((p: unknown) => (typeof p === 'number' ? `[${p + 1}]` : String(p).replace(/_/g, ' '))).join(' ').trim()
  if (!field) return msg
  if (msg.toLowerCase().startsWith(field.split(' [')[0].toLowerCase())) return msg
  return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${msg}`
}

async function request<T>(method: string, path: string, body?: unknown, opts: { form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const sk = getSessionKey()
  if (sk) headers['X-Session-Key'] = sk
  let payload: BodyInit | undefined
  if (opts.form) payload = opts.form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${API_URL}/api${path}`, { method, headers, body: payload })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const detail = data?.detail
    const msg = Array.isArray(detail)
      ? detail.map(validationMessage).join('; ')
      : detail || res.statusText || 'Request failed'
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: async (file: File, role: UploadRole = 'user', seconds?: number) => {
    const form = new FormData()
    form.append('file', file)
    form.append('role', role)
    // the browser's reading of a video's length - the API only uses it when the file's own header has none
    if (seconds && Number.isFinite(seconds)) form.append('seconds', String(seconds))
    return request<{ path: string; url: string; kind: 'image' | 'video' | 'audio'; video?: { seconds: number | null; fine: number } | null }>('POST', '/upload', undefined, { form })
  },
}

/** Public GET used inside route loaders (runs on the server during SSR, no auth). */
export async function publicGet<T>(path: string, params?: Query): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}${qs(params)}`)
  if (!res.ok) throw new ApiError(res.status, `Failed to load ${path}`)
  return (await res.json()) as T
}

// ---------------------------------------------------------------- shared types
export type Category = { id: number; name: string; slug: string; icon: string; parent_id: number | null; level: number; children: Category[] }
export type Variant = { id: number; amount: number; color: string; size: string; type: string; stock: number }
export type ItemCard = {
  id: number; code: string; title: string; image: string; images: string[]; is_verified: boolean; on_shelve: boolean
  shelve_name: string; shelve_id: number | null; ward: string; rating: number; rating_count: number
  min_amount: number; max_amount: number; old_amount: number | null; sold_count: number; views?: number; adsite_views?: number; stock: number; status: string
  condition: string; gender: string; boosted: boolean; boost_channels: string[]; boost_until?: string | null; barter_enabled: boolean; barter_accepts: string[]
  /** true = the ad runs on the UKOapp ad site only (paid per 1,000 views) and is never listed in UKOshop */
  adsite_only?: boolean
  category_id: number | null; sub_category_id: number | null; seller_id: number
}
export type Shelve = {
  id: number; name: string; owner_name: string; owner_users_id: number | null; licence: string; country: string; county: string; ward: string
  address: string; landmark: string; contact_phone: string; contact_email: string; extra_contacts: { label: string; value: string }[]
  opening_time: string; closing_time: string; open_sunday: boolean; sunday_hours: string; delivery_fee: number
  barter_fee: number; capacity: number; image: string; status: string; is_open: boolean; lat: number | null; lng: number | null; relocating_date: string | null
  termination_requested: boolean; items_count?: number; capacity_used_pct?: number; slots_free?: number
}
export type Seller = { id: number; name: string; avatar: string; tier: string; positive_rate: number; items_sold: number; joined_year: number; whatsapp?: string | null; socials?: Record<string, string> | null; telephone: string; email: string }
/** Seller → shelf hand-off. Dropping the item off yourself is free; a rider is priced per km per vehicle (GET /shelves/{id}/pickup-quote). */
export type PickupVehicle = {
  key: string; name: string; desc: string; max_kg: number; max_km: number; base: number; per_km: number
  distance_km: number; fee: number; eta_minutes: number; available: boolean; reason: string
}
export type PickupQuote = { shelve: Shelve; distance_km: number; weight_kg: number; vehicles: PickupVehicle[]; suggested: string; free_storage_days: number }
/** `paid` — the trip is charged on the way out of Post ad, with the boost, not to the rider on collection. */
export type ItemPickup = { lat: number | null; lng: number | null; address: string; vehicle: string; distance_km: number; fee: number; paid: boolean }
/**
 * The rider trip taking a seller's item to the shelf (GET /seller/items → `pickup_job`, null unless handoff_method 'agent').
 * `seller_code` is read to the rider when the item is handed over — it proves he collected it; the shelf checks the
 * item in with the separate hand-off code, and that is when the rider is paid.
 */
export type SellerPickupJob = {
  id: number; job_no: string; status: 'offered' | 'accepted' | 'collected' | 'delivered' | 'cancelled'; fee: number; vehicle: string; distance_km: number
  rider: { name: string; phone: string } | null; accepted_at: string | null; collected_at: string | null; delivered_at: string | null; seller_code: string
}
/**
 * Getting an item back off a shelf (GET /seller/items/{id}/return-options · POST /seller/items/{id}/return).
 *
 * Five ways home, and the API prices and judges every one of them — `available` false is a real answer with a
 * `reason` the seller can act on, not a hole in the list:
 *
 *   self            he collects it at the shelf                                     free, always
 *   reshelve        it stays there on a fresh free stay                             free, needs a slot
 *   rider           a rider brings it from the shelf to his pin                     same county, after the idle wait
 *   shelf_transfer  a courier takes it back to his original shelf                   other county only
 *   courier_rider   a courier to a shelf near him, then a rider to his door         other county only
 *
 * Nothing here is ever sent back as a price: `fee` is what the server said this time, and the server re-measures
 * and re-prices the whole thing when the seller commits.
 */
export type ReturnMode = 'self' | 'reshelve' | 'rider' | 'shelf_transfer' | 'courier_rider'
export type ReturnVehicle = { key: string; name: string; desc: string; fee: number; distance_km: number; eta_minutes: number; available: boolean; reason: string; base: number; per_km: number }
export type ReturnOption = {
  key: ReturnMode; label: string; sub: string; available: boolean; reason: string; fee: number
  lines: { key: string; label: string; detail: string; amount: number }[]
  vehicle?: string; vehicle_name?: string; vehicles?: ReturnVehicle[]; distance_km?: number; rider_km?: number; eta_minutes?: number
  to_shelve_id?: number | null; to_shelve?: string; is_original?: boolean; days?: string; class_name?: string
  slots_free?: number; idle_days?: number; idle_required?: number
  /** Only waiting for the seller's pin — selectable so the map can open, but not yet bookable. */
  needs_pin?: boolean
}
export type ItemReturnLeg = {
  type: 'rider' | 'courier'; no: string; status: string; fee: number; distance_km: number
  rider?: { name: string; phone: string } | null; driver?: { name: string; phone: string } | null; seller_code?: string
}
export type ItemReturn = {
  id: number; return_no: string; mode: ReturnMode; status: string; fee: number; paid: boolean; label: string
  from_shelve: string; to_shelve: string; rider_fee: number; courier_fee: number
  requested_at: string | null; delivered_at: string | null; cancelled_reason: string; legs: ItemReturnLeg[]
}
export type ReturnOptions = {
  item_id: number; title: string; weight_kg: number; shelve_id: number | null; shelve: string
  shelve_lat: number | null; shelve_lng: number | null
  shelve_county: string; seller_county: string; same_county: boolean; shelve_status: string
  idle_days: number; idle_required: number; free_storage_days: number; has_pin: boolean
  options: ReturnOption[]; blocked: string; current: ItemReturn | null
}
export type Review = { id: number; item_id: number; item_title: string; users_id: number | null; name: string; rating: number; message: string; media: string[]; verified_purchase: boolean; context: string; reply: string; reply_at: string | null; created_at: string }
export type ItemFull = ItemCard & {
  description: string; features: string; specification: string; brand: string; sku: string; weight_kg: number; county: string; videos: string[]
  colors: string[]; sizes: string[]; views: number; variants: Variant[]; category: Category | null; sub_category: Category | null; catalogue: Category | null
  shelve: Shelve | null; shelve_status: string; handoff_method: string; seller: Seller; boost_until: string | null; boost_counties: string[]; created_at: string
  /** free shelf storage runs out on this day; `pickup` is set only when a rider collects the item (handoff_method 'agent') */
  shelve_expires_at: string | null; pickup: ItemPickup | null
  feedback: { count: number; average: number; bars: { stars: number; pct: number }[]; media: string[]; reviews: Review[] }
  more_from_seller: ItemCard[]; crumbs: { name: string; href: string }[]
  barter_via_shelve: boolean; barter_types: { key: string; label: string }[]; barter_policy: string
}
/** Seller messaging package · type starter | growth | business | custom ('pro' = legacy monthly / annual row) · expiration null = never expires · features.units = units bought per channel */
export type Package = { id: number; type: string; annually: boolean; amount: number; expiration: string | null; features: Record<string, any>; status: string; since: string | null }

// ---------------------------------------------------------------- pay-per-use messaging
export type MessagingChannel = 'email' | 'sms' | 'whatsapp' | 'push' | 'twitter' | 'facebook' | 'instagram'
export type SocialProvider = 'twitter' | 'facebook' | 'instagram'
export type ChannelUnits = Partial<Record<MessagingChannel, number>>
/** UKOshop's own X / Facebook / Instagram account every seller's post is published on · configured = false → posting is simulated (server keys not set) */
export type SocialAccount = { provider: SocialProvider; name: string; configured: boolean }
export type SocialAccounts = Record<SocialProvider, SocialAccount>
/** Posting rules shown before a social post — render `text` from the API. */
export type SocialPolicy = { version: string; text: string }
/** Seller-facing slice of GET /api/seller/packages/pricing (cost / profit figures are internal and deliberately not typed). */
export type ChannelPrice = { channel: MessagingChannel; label: string; unit: string; unit_price: number }
export type PackageLine = { channel: MessagingChannel; label: string; units: number; unit_price: number; list_price: number }
export type PackageQuote = { units: ChannelUnits; lines: PackageLine[]; amount: number }
export type MessagingBundle = PackageQuote & { key: 'starter' | 'growth' | 'business'; name: string; tagline: string }
export type MessagingPricing = { channels: ChannelPrice[]; min_package: number; expires: boolean; bundles: MessagingBundle[] }
/** Channels a bulk, ward-targeted campaign goes out on — posts go on UKOshop's own accounts and have no audience to target. */
export type BulkChannel = 'email' | 'sms' | 'whatsapp' | 'push'
/** Every contact a seller's marketing may reach a buyer on (terms s. 12) — each one allowed or refused on its own. */
export type MarketingChannel = 'email' | 'sms' | 'whatsapp' | 'inapp' | 'push'
export const MARKETING_CHANNELS: MarketingChannel[] = ['email', 'sms', 'whatsapp', 'inapp', 'push']
// Service notifications (terms s. 13A): who sends them and the contacts they use. Admin is always on and has no switch.
export type NotifySource = 'seller' | 'shelve' | 'delivery' | 'courier' | 'admin'
export type NotifyChannel = 'push' | 'sms' | 'email'
export type NotifySettings = Record<NotifySource, Record<NotifyChannel, boolean>>
/** The wards a package was bought for — saved with the package and pre-filled on the messaging page. */
export type Targeting = { country?: string; county?: string; wards?: string[] }
/** One ward and how many accounts in it the channel can reach. */
export type WardReach = { ward: string; county: string; reach: number }
/** GET /api/seller/audience — how many accounts the picked wards reach, and what every ward on offer holds.
 *  `total` is everyone marketable in the county / country, `reach` what the picked wards come to (total when none are
 *  picked), `sendable` the reach capped at what one campaign may carry. Accounts that switched marketing off are in none of it. */
export type AudienceData = {
  channel: BulkChannel; total: number; reach: number; sendable: number; wards: string[]; ward_reach: WardReach[]; missing: string[]
  country: string; county: string; countries: string[]; counties: string[]; max_per_campaign: number; unit_price: number; balance: number
}
export type PackagesData = {
  current: Package | null; history: Package[]; balances: Record<MessagingChannel, number>; pricing: MessagingPricing; whatsapp: string
  accounts: SocialAccounts; social_policy: SocialPolicy
  targeting: Targeting; bulk_channels: BulkChannel[]; max_per_campaign: Record<BulkChannel, number>
}
/** A copy-to address on the profile page. `email` (User.email) is the sign-in one and is never in this list. */
export type ExtraEmail = { label: string; email: string }
export type User = {
  id: number; name: string; email: string; telephone: string; wallets?: { seller: number; shelve: number; rider: number; courier?: number; buyer: number }; staff_id?: string
  profile: { first_name: string; last_name: string; store_name: string; country: string; county: string; location: string; ward: string; birthday: string | null; gender: string; avatar: string; extra_emails?: ExtraEmail[]; email_verified?: boolean; phone_verified?: boolean; seller_package: string; package_features: Record<string, any>; package?: Package | null; ai_prompts_remaining: number; positive_rate: number; items_sold: number; joined_year: number; mpesa_number?: string; marketing_opt_in?: boolean; marketing_channels?: Record<MarketingChannel, boolean>; notifications?: NotifySettings; is_buyer?: boolean; terms_version?: string; terms_accepted_at?: string | null }
  /** shelve_owner / rider / courier: staff linked this shop account to that partner. The partner signs in to its own app
   *  with its company e-mail; the shop only shows the console link and lets the linked wallet pay for UKO services. */
  roles: { seller: boolean; shelve_owner: boolean; rider: boolean; courier?: boolean; admin: boolean }
}
/** The number every M-PESA prompt for this account goes to — the profile one, falling back to the contact phone (app/routers/orders.py pay). */
export const mpesaNumber = (u: User | null | undefined): string => (u?.profile?.mpesa_number || u?.telephone || '').trim()
export type Locations = { countries: string[]; default_country: string; counties: Record<string, string[]>; wards: Record<string, string[]> }
export type CartLine = { id: number; item: ItemCard; variant: Variant | null; variant_label: string; quantity: number; amount: number; old_amount: number | null; available: number; low_stock: boolean; saved_for_later: boolean }
export type Cart = { items: CartLine[]; notices: string[]; summary: { count: number; subtotal: number; shelves: number; discount: number; promo_code: string; protect_fee: number; delivery_fee: number | null; total: number; hold_hours: number } }
/** `shelve_*` is the shelf holding this line — one order can carry several sellers' items on several
 *  shelves, so each side is shown the shelf that has the item it is asking about. */
export type OrderItem = {
  id: number; item_id: number; code: string; variant_id: number | null; title: string; variant_label: string; image: string; amount: number; quantity: number
  seller_id: number; shelve_id: number | null; shelve_name: string; shelve_owner_users_id: number | null; shelve_phone: string
  /** This line's own standing. One cart can hold several sellers' items, so cancelling or returning is
   *  decided per line — `refund_amount` is what went back to the buyer's wallet for it. */
  seller_status: 'accepted' | 'cancelled' | 'returned'; refund_amount: number; refunded_at: string | null
  /** Seller console only (`/seller/orders`): whether he may still cancel this line, and why not when he
   *  may not. Cancelling is his only while the item is still at his shop — once it is on a shelf, with a
   *  rider or with the buyer it can only be marked returned. */
  can_cancel?: boolean; cancel_block?: string
}
export type Rider = { id: number; users_id: number | null; name: string; phone: string; alt_phone: string; email: string; vehicle_type: string; number_plate: string; rating: number; drops: number; wards: string[]; days: string[]; start_time: string; end_time: string; is_online: boolean; avatar: string }
export type Delivery = {
  id: number; tracking_no: string; order_id: number; order_no: string; rider: Rider | null; origin: Shelve | null; destination: string; destination_ward: string
  distance_km: number; weight_kg: number; fee: number; status: string; trade_type?: string; window_start: string; window_end: string; eta: string
  offer_expires: string | null; events: { title: string; sub: string; time: string }[]; rider_lat: number | null; rider_lng: number | null; proof: Record<string, any>
  /** The buyer's checkout pin — where the parcel is going. Null when he never dropped one. */
  dest_lat: number | null; dest_lng: number | null
  items: OrderItem[]; buyer: { name: string; phone: string; notes: string } | null; expires_in?: number
}
export type Order = {
  id: number; order_no: string; buyer_id: number; buyer_name: string; buyer_phone: string; shelve: Shelve | null; trade_type: 'cash' | 'barter'; bid_id: number | null
  /** Where the buyer collects, when the order ends at a shelf rather than at his door — a `shelf_run`
   *  drop or the shelf a `courier` leg was addressed to. Null for a run to his gate. */
  collect_shelve?: Shelve | null
  /** Roll-up of the lines: accepted while any of them still stands. `refunded_total` is everything paid
   *  back into the buyer's wallet across this order. */
  seller_status: 'accepted' | 'cancelled' | 'returned'; refunded_total: number
  /** The buyer's own codes (with `claim_code`). Buyer routes only — `/seller/orders` leaves all three out. */
  shelve_code: string; rider_code: string; delivery_option: string; subtotal: number; shelve_fee: number
  delivery_fee: number; discount: number; protect_fee: number; promo_code: string; total: number; commission: number; payment_method: string; payment_ref: string; payment_status: string
  status: string; claim_code: string; recipient_name: string; phone: string; estate: string; house: string; ward: string; notes: string; is_direct: boolean; hold_until: string | null
  dest_lat: number | null; dest_lng: number | null
  created_at: string; items: OrderItem[]; item_count: number; delivery?: Delivery | null; window?: string
  trade_label?: string; via_shelve?: boolean; location?: string; bid?: Bid | null
}
export type Notification = { id: number; type: string; title: string; body: string; link: string; is_read: boolean; created_at: string }
/** GET /api/chat — one row per person talked to, `unread` = his messages you have not opened. */
export type Conversation = { user_id: number; name: string; last: string; time: string; item_id: number | null; unread: number }
export type Bid = {
  id: number; item_id: number; item: ItemCard | null; buyer: { id: number; name: string; telephone: string } | null; seller_id: number
  offer_type: 'item' | 'item_cash' | 'item_service' | 'service' | 'cash_service'; offered_item: string; offered_item_images: string[]; offered_service: string
  cash_amount: number; message: string; trade_mode: 'direct' | 'shelve'; shelve: Shelve | null; shelve_fee: number
  status: 'pending' | 'accepted' | 'declined' | 'awaiting_inspection' | 'inspected' | 'rejected_inspection' | 'completed' | 'cancelled'
  inspection_notes: string; order_id: number | null; created_at: string
}
export type BarterType = { key: Bid['offer_type']; label: string }
/** The three wallets an account can hold. Every one of them keeps `fee_pct` (10%) with UKO when money is withdrawn
 * to M-PESA, and every one of them can be spent inside UKO on boosts, packages and AI prompts for nothing (PayWith). */
/** `buyer` is the refund wallet every account has: cancelled and returned items are paid back into it,
 *  and it is the one wallet that withdraws to M-PESA without the 10 % fee — a refund is the buyer's own money. */
/** `shelve` / `rider` / `courier` belong to the partner row staff linked to this account: they pay for UKO services here,
 *  but are withdrawn in the partner's own app (`can_withdraw: false`, `withdraw_in` names that app). */
export type WalletRole = 'seller' | 'shelve' | 'rider' | 'courier' | 'buyer'
export type Wallet = {
  role: WalletRole; balance: number; min_withdrawal: number; fee_pct: number; mpesa_number: string
  can_withdraw?: boolean; withdraw_in?: '' | 'shelves' | 'delivery' | 'courier'
  ledger: { amount: number; reason: string; ref: string; time: string | null }[]
  withdrawals: Withdrawal[]
}
/** GET /api/wallet/payable — a wallet this account can pay a UKO service from. */
export type PayableWallet = { role: WalletRole; label: string; balance: number }
/** debit_payments row · status pending | approved | failed | cancelled · error / error_code (e.g. 2001) when M-PESA refused the payout */
export type Withdrawal = {
  id: number; role?: Wallet['role']; method: 'mpesa' | 'card'; account: string; amount: number; fee: number; net: number; status: string; ref: string; time: string | null
  conversation_id: string; originator_conversation_id: string; receipt: string; error: string; error_code: string; simulated: boolean; socket_key: string
}
export type WithdrawResponse = { withdrawal: Withdrawal; wallet: Wallet; message: string; expires_in: number; socket: { rooms: string[]; key?: string }; relayed?: boolean; note?: string }
/**
 * account: 'user' for e-mail / SMS / WhatsApp, 'uko' for social posts on UKOshop's accounts ('user' / 'admin' on legacy social rows — render all social rows as UKOshop).
 * status: e.g. sent | failed | withdrawn · stats.units = units used · stats.results[0] = { status, account, post_id?, url?, error?, unavailable? } for social channels
 * · results[0].unavailable = the channel was down (no credits / keys / permission), not the seller's post — no unit was used
 * · stats.withdrawn = { at, reason, by } when UKO withdrew a flagged post.
 */
export type Campaign = { id: number; channel: MessagingChannel; account: 'user' | 'uko' | 'admin'; subject: string; body: string; item_id: number | null; recipients: string[]; audience: string; status: 'withdrawn' | (string & {}); stats: Record<string, any>; media: string; media_type: string; created_at: string }
